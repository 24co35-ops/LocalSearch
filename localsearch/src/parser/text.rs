use super::Parser;
use anyhow::Result;
use std::fs;
use std::path::Path;

pub struct TextParser;

impl Parser for TextParser {
    fn extract_text(&self, path: &Path) -> Result<String> {
        // Read with lossy UTF-8 to handle various encodings
        let bytes = fs::read(path)?;
        Ok(String::from_utf8_lossy(&bytes).to_string())
    }
}
