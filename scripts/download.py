#!/usr/bin/env python3
"""Download a YouTube video from a URL."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


DEFAULT_OUTDIR = Path("downloads")

# Debian alternatives can point at missing atlas libs; real libs live here.
_EXTRA_LIB_DIRS = (
    Path("/usr/lib/x86_64-linux-gnu/blas"),
    Path("/usr/lib/x86_64-linux-gnu/lapack"),
)


def ensure_ffmpeg_libs() -> None:
    """Make ffmpeg find BLAS/LAPACK when system alternatives are broken."""
    current = os.environ.get("LD_LIBRARY_PATH", "")
    parts = [p for p in current.split(":") if p]
    changed = False
    for lib_dir in _EXTRA_LIB_DIRS:
        if not lib_dir.is_dir():
            continue
        path = str(lib_dir)
        if path not in parts:
            parts.insert(0, path)
            changed = True
    if changed:
        os.environ["LD_LIBRARY_PATH"] = ":".join(parts)


def has_ffmpeg() -> bool:
    ensure_ffmpeg_libs()
    if not shutil.which("ffmpeg"):
        return False
    # Confirm ffmpeg actually starts (shared libs can be broken).
    import subprocess

    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            check=True,
            capture_output=True,
            timeout=10,
        )
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def _video_format(quality: str, *, prefer_mp4: bool) -> str:
    """Build a yt-dlp format string that prefers MP4 and always includes audio."""
    height = {"1080": 1080, "720": 720, "480": 480}.get(quality)
    h = f"[height<={height}]" if height else ""

    if prefer_mp4:
        # Prefer H.264/AAC in MP4, then any MP4/M4A pair, then any mergeable streams.
        return (
            f"bv*[ext=mp4][vcodec^=avc1]{h}+ba[ext=m4a]/"
            f"bv*[ext=mp4]{h}+ba[ext=m4a]/"
            f"b[ext=mp4]{h}/"
            f"bv*{h}+ba/b{h}/b"
        )

    # Progressive muxed file only (no ffmpeg) — prefer MP4.
    return (
        f"best[ext=mp4][acodec!=none][vcodec!=none]{h}/"
        f"best[acodec!=none][vcodec!=none]{h}/"
        f"best[acodec!=none][vcodec!=none]/best"
    )


def build_opts(outdir: Path, audio_only: bool, quality: str) -> dict:
    outdir.mkdir(parents=True, exist_ok=True)
    ffmpeg = has_ffmpeg()

    if audio_only:
        outtmpl = str(outdir / "%(title)s [%(id)s].%(ext)s")
        opts: dict = {
            "format": "bestaudio/best",
            "outtmpl": outtmpl,
            "noplaylist": True,
        }
        if ffmpeg:
            opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ]
        return opts

    # %(ext)s is required for multi-stream downloads; final file is always remuxed to mp4.
    outtmpl = str(outdir / "%(title)s [%(id)s].%(ext)s")

    if ffmpeg:
        return {
            "format": _video_format(quality, prefer_mp4=True),
            "format_sort": ["res", "vcodec:h264", "acodec:aac", "ext:mp4:m4a"],
            "outtmpl": outtmpl,
            "merge_output_format": "mp4",
            "postprocessors": [
                {"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"},
            ],
            "noplaylist": True,
        }

    return {
        "format": _video_format(quality, prefer_mp4=False),
        "outtmpl": outtmpl,
        "noplaylist": True,
    }


def download(url: str, outdir: Path, audio_only: bool, quality: str) -> Path | None:
    ensure_ffmpeg_libs()
    opts = build_opts(outdir, audio_only, quality)
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if not info:
            return None
        # Prefer the final merged path when available.
        requested = info.get("requested_downloads") or []
        if requested and requested[0].get("filepath"):
            return Path(requested[0]["filepath"])
        filename = ydl.prepare_filename(info)
        if audio_only and has_ffmpeg():
            filename = str(Path(filename).with_suffix(".mp3"))
        elif info.get("ext") and not audio_only:
            filename = str(Path(filename).with_suffix(f".{info['ext']}"))
        # After merge, yt-dlp may report mp4 even if prepare_filename used another ext.
        if not audio_only and opts.get("merge_output_format"):
            merged = Path(filename).with_suffix(f".{opts['merge_output_format']}")
            if merged.exists():
                return merged
        return Path(filename)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download a YouTube video (or audio) from a URL."
    )
    parser.add_argument("url", help="YouTube video URL")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUTDIR,
        help=f"Output directory (default: {DEFAULT_OUTDIR})",
    )
    parser.add_argument(
        "-q",
        "--quality",
        choices=["best", "1080", "720", "480"],
        default="best",
        help="Max video quality (default: best)",
    )
    parser.add_argument(
        "-a",
        "--audio-only",
        action="store_true",
        help="Download audio only (MP3 if ffmpeg is installed)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    ensure_ffmpeg_libs()

    if not has_ffmpeg():
        print(
            "Note: ffmpeg unavailable. Downloading a lower-quality file that "
            "already includes audio. Fix ffmpeg for best quality.",
            file=sys.stderr,
        )

    try:
        path = download(args.url, args.output, args.audio_only, args.quality)
    except DownloadError as exc:
        print(f"Download failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if path:
        print(f"Saved to: {path}")
    else:
        print("Download finished, but output path could not be determined.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
