use clap::{Parser, Subcommand};
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

mod config;
mod indexer;
mod searcher;
mod parser;
mod server;
mod watcher;
mod snippet;

use config::{load_config, resolve_path};
use indexer::IndexManager;
use searcher::SearchEngine;
use server::{create_router, AppState};
use watcher::FileWatcher;

#[derive(Parser)]
#[command(name = "localsearch")]
#[command(about = "Private offline search engine for local files", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Index the configured root directory
    Index,
    /// Search for terms (CLI mode)
    Search {
        query: String,
        #[arg(short, long, default_value_t = 10)]
        limit: usize,
    },
    /// Start the file watcher
    Watch,
    /// Start the search server and file watcher
    Serve,
}

#[tokio::main]
async fn main() -> Result<()> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let cli = Cli::parse();
    let config = load_config()?;
    let index_manager = Arc::new(IndexManager::open_or_create(&config)?);

    match cli.command {
        Commands::Index => {
            let root = resolve_path(&config.index.root_dir);
            index_manager.index_directory(&config, &root)?;
            info!("Indexing completed.");
        }
        Commands::Search { query, limit } => {
            let search_engine = SearchEngine::new(&index_manager)?;
            let (results, total) = search_engine.search(&index_manager, &query, limit, &config)?;
            println!("Found {} results:", total);
            for res in results {
                println!("[{}] {}", res.rank, res.path);
            }
        }
        Commands::Watch => {
            let watcher = FileWatcher::new(config, index_manager);
            watcher.start().await?;
        }
        Commands::Serve => {
            let search_engine = Arc::new(SearchEngine::new(&index_manager)?);
            let state = AppState {
                config: Arc::new(RwLock::new(config.clone())),
                index_manager: index_manager.clone(),
                search_engine,
            };

            // Start watcher in background
            let watcher_config = config.clone();
            let watcher_index = index_manager.clone();
            tokio::spawn(async move {
                let watcher = FileWatcher::new(watcher_config, watcher_index);
                if let Err(e) = watcher.start().await {
                    eprintln!("Watcher error: {}", e);
                }
            });

            let addr = format!("{}:{}", config.server.host, config.server.port);
            let listener = tokio::net::TcpListener::bind(&addr).await?;
            info!("LocalSearch server listening on http://{}", addr);

            let app = create_router(state);
            axum::serve(listener, app).await?;
        }
    }

    Ok(())
}
