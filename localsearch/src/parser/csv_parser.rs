use super::Parser;
use anyhow::Result;
use std::path::Path;

pub struct CsvParser;

impl Parser for CsvParser {
    fn extract_text(&self, path: &Path) -> Result<String> {
        let mut rdr = csv::ReaderBuilder::new()
            .flexible(true)
            .from_path(path)?;
        
        let mut content = String::new();
        for result in rdr.records() {
            let record = result?;
            for field in record.iter() {
                content.push_str(field);
                content.push(' ');
            }
            content.push('\n');
        }
        Ok(content)
    }
}
