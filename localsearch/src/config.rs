use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use anyhow::{Context, Result};
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub index: IndexConfig,
    pub watcher: WatcherConfig,
    pub search: SearchConfig,
    pub server: ServerConfig,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexConfig {
    pub root_dir: String,
    pub store_path: String,
    pub max_file_size_mb: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatcherConfig {
    pub debounce_ms: u64,
    pub ignore_patterns: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchConfig {
    pub default_limit: usize,
    pub snippet_context_chars: usize,
    pub recency_boost: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            index: IndexConfig {
                root_dir: "~/notes".to_string(),
                store_path: "~/.localsearch/index".to_string(),
                max_file_size_mb: 50,
            },
            watcher: WatcherConfig {
                debounce_ms: 500,
                ignore_patterns: vec![
                    ".git".to_string(),
                    "node_modules".to_string(),
                    "target".to_string(),
                    "__pycache__".to_string(),
                    ".DS_Store".to_string(),
                ],
            },
            search: SearchConfig {
                default_limit: 10,
                snippet_context_chars: 100,
                recency_boost: true,
            },
            server: ServerConfig {
                port: 7474,
                host: "127.0.0.1".to_string(),
            },
        }
    }
}

pub fn get_config_path() -> PathBuf {
    home::home_dir()
        .map(|p| p.join(".localsearch").join("config.toml"))
        .unwrap_or_else(|| PathBuf::from("config.toml"))
}

pub fn load_config() -> Result<AppConfig> {
    let path = get_config_path();
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read config file at {:?}", path))?;
    
    let config: AppConfig = toml::from_str(&content)
        .with_context(|| "Failed to parse config.toml")?;
    
    Ok(config)
}

pub fn save_config(config: &AppConfig) -> Result<()> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    
    let content = toml::to_string_pretty(config)?;
    fs::write(&path, content)?;
    Ok(())
}

pub fn resolve_path(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        if let Some(home) = home::home_dir() {
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}
