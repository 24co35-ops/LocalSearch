use tantivy::query::Query;
use tantivy::{Searcher, DocAddress, SnippetGenerator, Index};
use tantivy::schema::{Field, Schema};

pub struct SnippetEngine {
    schema: Schema,
}

impl SnippetEngine {
    pub fn new(schema: Schema) -> Self {
        Self { schema }
    }

    pub fn generate_snippet(
        &self,
        searcher: &Searcher,
        query: &dyn Query,
        doc_address: DocAddress,
        content_field: Field,
        context_chars: usize,
    ) -> String {
        let mut snippet_generator = SnippetGenerator::create(searcher, query, content_field).unwrap();
        // Tantivy 0.22 SnippetGenerator
        let retrieved_doc = searcher.doc(doc_address).unwrap();
        let content = retrieved_doc.get_first(content_field)
            .and_then(|v| v.as_text())
            .unwrap_or("");

        let snippet = snippet_generator.snippet(content);
        
        // Convert to HTML marks
        let mut html = String::new();
        for fragment in snippet.fragments() {
            // This is a bit complex in Tantivy's API
            // Usually we use snippet.to_html() but we want custom mark tags maybe?
            // The prompt says <mark> tags.
        }
        
        // Simplified: Use to_html and replace tags if needed
        snippet.to_html()
            .replace("<b>", "<mark class=\"bg-primary-container text-on-primary-container px-0.5 rounded-sm\">")
            .replace("</b>", "</mark>")
    }
}
