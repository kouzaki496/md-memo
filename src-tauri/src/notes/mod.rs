//! メモの検索・保存

pub mod crud;
mod frontmatter;
pub mod search;
pub mod seeded;
mod store;
pub mod tag_global;
mod types;
pub mod window;

pub use seeded::ensure_editor_shortcuts_note;
