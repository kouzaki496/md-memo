fn main() {
    // アイコンだけ差し替えたときでも exe に埋め込みが更新されるようにする
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
