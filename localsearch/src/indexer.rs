use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use std::fs;
use tantivy::schema::*;
use tantivy::{Index, IndexWriter, ReloadPolicy, doc, Term};
use crate::config::{AppConfig, resolve_path};
use crate::parser::ParserRegistry;
use tracing::{info, warn, error};

pub struct IndexManager {
    pub index: Index,
    pub schema: Schema,
    pub field_path: Field,
    pub field_content: Field,
    pub field_modified_at: Field,
    pub field_file_size: Field,
    pub field_extension: Field,
}

impl IndexManager {
    pub fn open_or_create(config: &AppConfig) -> Result<Self> {
        let store_path = resolve_path(&config.index.store_path);
        if !store_path.exists() {
            fs::create_dir_all(&store_path)?;
        }

        let mut schema_builder = Schema::builder();
        let field_path = schema_builder.add_text_field("path", TEXT | STORED);
        let field_content = schema_builder.add_text_field("content", TEXT | STORED);
        let field_modified_at = schema_builder.add_i64_field("modified_at", INDEXED | STORED);
        let field_file_size = schema_builder.add_u64_field("file_size", STORED);
        let field_extension = schema_builder.add_text_field("extension", STRING | STORED);
        let schema = schema_builder.build();

        let index = Index::open_or_create(tantivy::directory::MmapDirectory::open(&store_path)?, schema.clone())?;

        Ok(Self {
            index,
            schema,
            field_path,
            field_content,
            field_modified_at,
            field_file_size,
            field_extension,
        })
    }

    pub fn index_directory(&self, config: &AppConfig, dir: &Path) -> Result<()> {
        let mut writer = self.index.writer(50 * 1024 * 1024)?; // 50MB buffer
        let parser_registry = ParserRegistry::new();

        self.index_dir_recursive(&mut writer, &parser_registry, dir, config)?;

        writer.commit()?;
        info!("Indexing complete for {:?}", dir);
        Ok(())
    }

    fn index_dir_recursive(
        &self,
        writer: &mut IndexWriter,
        parsers: &ParserRegistry,
        dir: &Path,
        config: &AppConfig,
    ) -> Result<()> {
        info!("Scanning directory: {:?}", dir);
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = entry.metadata()?;

            if metadata.is_dir() {
                let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if config.watcher.ignore_patterns.iter().any(|p| name.contains(p)) {
                    continue;
                }
                self.index_dir_recursive(writer, parsers, &path, config)?;
            } else if metadata.is_file() {
                if metadata.len() > config.index.max_file_size_mb * 1024 * 1024 {
                    continue;
                }

                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if let Some(parser) = parsers.get_parser(ext) {
                    match parser.extract_text(&path) {
                        Ok(content) => {
                            let modified = metadata.modified()?
                                .duration_since(SystemTime::UNIX_EPOCH)?
                                .as_secs() as i64;

                            writer.add_document(doc!(
                                self.field_path => path.to_string_lossy().into_owned(),
                                self.field_content => content,
                                self.field_modified_at => modified,
                                self.field_file_size => metadata.len(),
                                self.field_extension => ext.to_string()
                            ))?;
                        }
                        Err(e) => error!("Failed to parse {:?}: {}", path, e),
                    }
                }
            }
        }
        Ok(())
    }

    pub fn delete_document(&self, path: &Path) -> Result<()> {
        let mut writer = self.index.writer(10 * 1024 * 1024)?;
        let term = Term::from_field_text(self.field_path, &path.to_string_lossy());
        writer.delete_term(term);
        writer.commit()?;
        Ok(())
    }
}
