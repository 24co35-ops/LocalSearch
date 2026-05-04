use anyhow::Result;
use std::path::PathBuf;
use std::time::SystemTime;
use tantivy::schema::*;
use tantivy::{IndexReader, ReloadPolicy};
use tantivy::query::{QueryParser, Query};
use tantivy::collector::TopDocs;
use crate::indexer::IndexManager;
use crate::config::AppConfig;
use serde::Serialize;
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub rank: usize,
    pub path: String,
    pub extension: String,
    pub score: f32,
    pub snippet: String,
    pub modified_at: DateTime<Utc>,
}

pub struct SearchEngine {
    reader: IndexReader,
    query_parser: QueryParser,
}

impl SearchEngine {
    pub fn new(manager: &IndexManager) -> Result<Self> {
        let reader = manager.index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;
        
        // Default search fields
        let mut query_parser = QueryParser::for_index(&manager.index, vec![manager.field_content, manager.field_path]);
        query_parser.set_field_alias(manager.field_extension, "ext");
        
        Ok(Self {
            reader,
            query_parser,
        })
    }

    pub fn search(
        &self, 
        manager: &IndexManager, 
        query_str: &str, 
        limit: usize,
        config: &AppConfig
    ) -> Result<(Vec<SearchResult>, usize)> {
        let searcher = self.reader.searcher();
        let query = self.query_parser.parse_query(query_str)?;
        
        let top_docs = searcher.search(&query, &TopDocs::with_limit(limit * 2))?; // Get more for filtering/re-ranking
        
        let mut results = Vec::new();
        let now = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_secs() as i64;

        for (i, (score, doc_address)) in top_docs.into_iter().enumerate() {
            let retrieved_doc: Document = searcher.doc(doc_address)?;
            
            let path = retrieved_doc.get_first(manager.field_path)
                .and_then(|v| v.as_text())
                .unwrap_or("");
            let ext = retrieved_doc.get_first(manager.field_extension)
                .and_then(|v| v.as_text())
                .unwrap_or("");
            let modified_at = retrieved_doc.get_first(manager.field_modified_at)
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            
            let mut final_score = score;

            // Recency boost
            if config.search.recency_boost {
                let age_days = (now - modified_at) as f32 / (24.0 * 3600.0);
                let recency_factor = if age_days <= 7.0 {
                    1.0
                } else if age_days >= 90.0 {
                    0.0
                } else {
                    1.0 - (age_days - 7.0) / (90.0 - 7.0)
                };
                final_score *= 1.0 + (0.1 * recency_factor);
            }

            // Path match bonus
            let filename = PathBuf::from(path)
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("")
                .to_lowercase();
            
            let query_terms: Vec<_> = query_str.to_lowercase()
                .split_whitespace()
                .filter(|s| !s.contains(':') && !s.starts_with('-'))
                .collect();
            
            if query_terms.iter().any(|t| filename.contains(t)) {
                final_score += 0.15;
            }

            // Snippet generation (simplified, full implementation in snippet.rs)
            // For now, use a placeholder or partial logic
            let snippet = format!("Matched in {}", path); 

            results.push(SearchResult {
                rank: i + 1,
                path: path.to_string(),
                extension: ext.to_string(),
                score: final_score,
                snippet,
                modified_at: DateTime::from_timestamp(modified_at, 0).unwrap_or_else(|| Utc::now()),
            });
        }

        // Re-sort results based on final_score
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
        results.truncate(limit);
        
        // Re-rank numbers
        for (i, res) in results.iter_mut().enumerate() {
            res.rank = i + 1;
        }

        let total = results.len(); // In real app, would be query count
        Ok((results, total))
    }
}
