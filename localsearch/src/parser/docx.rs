use super::Parser;
use anyhow::{Result, anyhow};
use std::path::Path;
use std::fs::File;
use docx_rs::*;

pub struct DocxParser;

impl Parser for DocxParser {
    fn extract_text(&self, path: &Path) -> Result<String> {
        let file = File::open(path)?;
        let docx = read_docx(&file).map_err(|e| anyhow!("DOCX parse error: {:?}", e))?;
        let mut content = String::new();
        
        // docx-rs Document contains children which can be paragraphs, tables, etc.
        for child in docx.document.children {
            match child {
                DocumentChild::Paragraph(p) => {
                    for run_or_ins_or_del in p.children {
                        if let ParagraphChild::Run(r) = run_or_ins_or_del {
                            for run_child in r.children {
                                if let RunChild::Text(t) = run_child {
                                    content.push_str(&t.text);
                                }
                            }
                        }
                    }
                    content.push('\n');
                },
                _ => {} // Handle tables etc. if needed
            }
        }
        
        Ok(content)
    }
}
