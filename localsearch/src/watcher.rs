use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event};
use std::path::Path;
use std::time::Duration;
use tokio::sync::mpsc;
use tokio::time::sleep;
use anyhow::Result;
use tracing::{info, error};
use crate::config::AppConfig;
use std::sync::Arc;
use crate::indexer::IndexManager;

pub struct FileWatcher {
    config: AppConfig,
    index_manager: Arc<IndexManager>,
}

impl FileWatcher {
    pub fn new(config: AppConfig, index_manager: Arc<IndexManager>) -> Self {
        Self { config, index_manager }
    }

    pub async fn start(&self) -> Result<()> {
        let (tx, mut rx) = mpsc::channel(100);
        let root_dir = crate::config::resolve_path(&self.config.index.root_dir);

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.blocking_send(event);
                }
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )?;

        watcher.watch(&root_dir, RecursiveMode::Recursive)?;
        info!("Watching directory: {:?}", root_dir);

        // Debounce loop
        let debounce_ms = self.config.watcher.debounce_ms;
        let index_manager = self.index_manager.clone();
        let config = self.config.clone();

        tokio::spawn(async move {
            let mut events_buffered = false;
            loop {
                tokio::select! {
                    Some(event) = rx.recv() => {
                        info!("File event detected: {:?}", event.kind);
                        events_buffered = true;
                    }
                    _ = sleep(Duration::from_millis(debounce_ms)), if events_buffered => {
                        info!("Debounce window closed, triggering re-index...");
                        // In a real app, strictly update only changed files
                        // For this version: trigger full (but incremental) index
                        if let Err(e) = index_manager.index_directory(&config, &root_dir) {
                            error!("Re-index failed: {}", e);
                        }
                        events_buffered = false;
                    }
                }
            }
        });

        // Keep the watcher alive
        let mut _w = watcher;
        loop {
            sleep(Duration::from_secs(3600)).await;
        }
    }
}
