use super::Parser;
use anyhow::{Result, anyhow};
use std::path::Path;
use lopdf::Document;

pub struct PdfParser;

impl Parser for PdfParser {
    fn extract_text(&self, path: &Path) -> Result<String> {
        let doc = Document::load(path).map_err(|e| anyhow!("PDF load error: {}", e))?;
        let mut content = String::new();
        
        let pages = doc.get_pages();
        let mut keys: Vec<_> = pages.keys().collect();
        keys.sort();
        
        for page_num in keys {
            if let Ok(text) = doc.extract_text(&[*page_num]) {
                content.push_str(&text);
                content.push('\n');
            }
        }
        
        Ok(content)
    }
}
