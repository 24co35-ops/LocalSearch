use anyhow::Result;
use std::path::Path;

pub mod text;
pub mod csv_parser;
pub mod pdf;
pub mod docx;

pub trait Parser: Send + Sync {
    fn extract_text(&self, path: &Path) -> Result<String>;
}

pub struct ParserRegistry {
    text: text::TextParser,
    csv: csv_parser::CsvParser,
    pdf: pdf::PdfParser,
    docx: docx::DocxParser,
}

impl ParserRegistry {
    pub fn new() -> Self {
        Self {
            text: text::TextParser,
            csv: csv_parser::CsvParser,
            pdf: pdf::PdfParser,
            docx: docx::DocxParser,
        }
    }

    pub fn get_parser(&self, extension: &str) -> Option<&dyn Parser> {
        match extension.to_lowercase().as_str() {
            "txt" | "md" => Some(&self.text),
            "csv" => Some(&self.csv),
            "pdf" => Some(&self.pdf),
            "docx" => Some(&self.docx),
            _ => None,
        }
    }
}
