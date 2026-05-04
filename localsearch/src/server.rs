use axum::{
    routing::{get, post},
    extract::{Query, State, Json},
    response::{IntoResponse, Response},
    http::StatusCode,
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::config::{AppConfig, save_config, resolve_path};
use crate::indexer::IndexManager;
use crate::searcher::{SearchEngine, SearchResult};
use tower_http::services::ServeDir;
use tracing::{info, error};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
    pub index_manager: Arc<IndexManager>,
    pub search_engine: Arc<SearchEngine>,
}

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/api/search", get(search_handler))
        .route("/api/status", get(status_handler))
        .route("/api/index", post(index_handler))
        .route("/api/config", get(get_config_handler))
        .route("/api/config", post(save_config_handler))
        .route("/api/open", post(open_file_handler))
        .fallback_service(ServeDir::new("../dist"))
        .with_state(state)
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    limit: Option<usize>,
}

#[derive(Serialize)]
struct SearchResponse {
    results: Vec<SearchResult>,
    total: usize,
    query_time_ms: u128,
}

async fn search_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<SearchResponse>, AppError> {
    let start = std::time::Instant::now();
    let config = state.config.read().await;
    let limit = params.limit.unwrap_or(config.search.default_limit);
    
    let (results, total) = state.search_engine.search(
        &state.index_manager, 
        &params.q, 
        limit, 
        &config
    )?;
    
    Ok(Json(SearchResponse {
        results,
        total,
        query_time_ms: start.elapsed().as_millis(),
    }))
}

#[derive(Serialize)]
struct StatusResponse {
    file_count: usize,
    index_size_mb: f64,
    last_indexed: String,
    watcher_active: bool,
    indexed_dirs: Vec<String>,
}

async fn status_handler(State(state): State<AppState>) -> Json<StatusResponse> {
    let config = state.config.read().await;
    
    let file_count = state.index_manager.index.reader().map(|r| r.searcher().num_docs() as usize).unwrap_or(0);
    
    let store_path = crate::config::resolve_path(&config.index.store_path);
    let index_size_bytes: u64 = std::fs::read_dir(&store_path)
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| entry.metadata().ok())
        .map(|meta| meta.len())
        .sum();
    let index_size_mb = index_size_bytes as f64 / (1024.0 * 1024.0);
    
    Json(StatusResponse {
        file_count,
        index_size_mb,
        last_indexed: chrono::Utc::now().to_rfc3339(), 
        watcher_active: true,
        indexed_dirs: vec![config.index.root_dir.clone()],
    })
}

async fn index_handler(State(state): State<AppState>) -> Result<StatusCode, AppError> {
    let config = state.config.read().await;
    let dir = resolve_path(&config.index.root_dir);
    state.index_manager.index_directory(&config, &dir)?;
    Ok(StatusCode::OK)
}

async fn get_config_handler(State(state): State<AppState>) -> Json<AppConfig> {
    let config = state.config.read().await;
    Json(config.clone())
}

async fn save_config_handler(
    State(state): State<AppState>,
    Json(new_config): Json<AppConfig>,
) -> Result<StatusCode, AppError> {
    save_config(&new_config)?;
    let mut config = state.config.write().await;
    *config = new_config;
    Ok(StatusCode::OK)
}

#[derive(Deserialize)]
struct OpenRequest {
    path: String,
}

async fn open_file_handler(
    Json(req): Json<OpenRequest>
) -> Result<StatusCode, AppError> {
    open::that(&req.path).map_err(|_| anyhow::anyhow!("Failed to open file"))?;
    Ok(StatusCode::OK)
}

// Error handling
struct AppError(anyhow::Error);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Error: {}", self.0),
        );
        let body = Json(serde_json::json!({ "error": error_message }));
        (status, body).into_response()
    }
}

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        Self(err.into())
    }
}
