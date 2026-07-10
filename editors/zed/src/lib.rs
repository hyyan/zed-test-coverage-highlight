// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Hyyan Abo Fakher

//! Zed extension shim for "Test Coverage Highlight".
//!
//! Zed extensions are sandboxed WASM and cannot draw gutters, so this ships a
//! language server (`covhl`) that reports coverage as `textDocument/documentColor`.
//! The shim only resolves and launches that server: it prefers a `covhl` already
//! on `$PATH`, otherwise downloads the prebuilt binary for the current platform
//! from GitHub Releases.

use std::fs;

use zed::settings::LspSettings;
use zed_extension_api::{self as zed, LanguageServerId, Result};

/// GitHub repo publishing the `covhl` release binaries.
const REPO: &str = "hyyan/zed-test-coverage-highlight";
const SERVER_NAME: &str = "covhl";

struct TestCoverageHighlight {
    cached_binary_path: Option<String>,
}

impl TestCoverageHighlight {
    fn binary_path(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<String> {
        // Prefer a binary already on PATH (e.g. a local build or manual install).
        if let Some(path) = worktree.which(SERVER_NAME) {
            return Ok(path);
        }

        // Reuse a previously downloaded binary if still present.
        if let Some(path) = &self.cached_binary_path {
            if fs::metadata(path).is_ok_and(|stat| stat.is_file()) {
                return Ok(path.clone());
            }
        }

        // Otherwise download the release asset for this platform.
        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::CheckingForUpdate,
        );
        let release = zed::latest_github_release(
            REPO,
            zed::GithubReleaseOptions {
                require_assets: true,
                pre_release: false,
            },
        )?;

        let (os, arch) = zed::current_platform();
        let suffix = if matches!(os, zed::Os::Windows) { ".exe" } else { "" };
        let asset_name = format!("{SERVER_NAME}-{}{suffix}.gz", target_triple(os, arch)?);
        let asset = release
            .assets
            .iter()
            .find(|asset| asset.name == asset_name)
            .ok_or_else(|| format!("no release asset named `{asset_name}`"))?;

        let version_dir = format!("{SERVER_NAME}-{}", release.version);
        let binary_path = format!("{version_dir}/{SERVER_NAME}{suffix}");

        if !fs::metadata(&binary_path).is_ok_and(|stat| stat.is_file()) {
            zed::set_language_server_installation_status(
                language_server_id,
                &zed::LanguageServerInstallationStatus::Downloading,
            );
            fs::create_dir_all(&version_dir)
                .map_err(|err| format!("failed to create directory `{version_dir}`: {err}"))?;
            zed::download_file(
                &asset.download_url,
                &binary_path,
                zed::DownloadedFileType::Gzip,
            )?;
            zed::make_file_executable(&binary_path)?;

            // Remove older downloaded versions.
            for entry in fs::read_dir(".").into_iter().flatten().flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if name.starts_with(&format!("{SERVER_NAME}-")) && name != version_dir {
                    fs::remove_dir_all(entry.path()).ok();
                }
            }
        }

        self.cached_binary_path = Some(binary_path.clone());
        Ok(binary_path)
    }
}

impl zed::Extension for TestCoverageHighlight {
    fn new() -> Self {
        Self {
            cached_binary_path: None,
        }
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        Ok(zed::Command {
            command: self.binary_path(language_server_id, worktree)?,
            args: Vec::new(),
            env: Default::default(),
        })
    }

    fn language_server_initialization_options(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        Ok(LspSettings::for_worktree(SERVER_NAME, worktree)
            .ok()
            .and_then(|settings| settings.initialization_options))
    }

    fn language_server_workspace_configuration(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        // Forwarded live via workspace/didChangeConfiguration, so changing a
        // setting re-colors without restarting the server.
        Ok(LspSettings::for_worktree(SERVER_NAME, worktree)
            .ok()
            .and_then(|settings| settings.settings))
    }
}

fn target_triple(os: zed::Os, arch: zed::Architecture) -> Result<String> {
    let triple = match (os, arch) {
        (zed::Os::Mac, zed::Architecture::Aarch64) => "aarch64-apple-darwin",
        (zed::Os::Mac, zed::Architecture::X8664) => "x86_64-apple-darwin",
        (zed::Os::Linux, zed::Architecture::Aarch64) => "aarch64-unknown-linux-gnu",
        (zed::Os::Linux, zed::Architecture::X8664) => "x86_64-unknown-linux-gnu",
        (zed::Os::Windows, zed::Architecture::X8664) => "x86_64-pc-windows-msvc",
        (os, arch) => return Err(format!("unsupported platform: {os:?}/{arch:?}")),
    };
    Ok(triple.to_string())
}

zed::register_extension!(TestCoverageHighlight);
