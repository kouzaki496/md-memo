//! メモの検索・保存

pub mod crud;
mod frontmatter;
mod match_strategy;
pub mod search;
mod search_cache;
#[cfg(test)]
mod frontmatter_contract;
#[cfg(test)]
mod search_contract;
pub mod seeded;
mod store;
pub mod tag_global;
mod types;
pub mod window;

pub use seeded::ensure_editor_shortcuts_note;
