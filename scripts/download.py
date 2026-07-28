#!/usr/bin/env python3
"""Download a YouTube video from a URL, or print metadata."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


DEFAULT_OUTDIR = Path("downloads")

_EXTRA_LIB_DIRS = (
    Path("/usr/lib/x86_64-linux-gnu/blas"),
    Path("/usr/lib/x86_64-linux-gnu/lapack"),
)


def ensure_ffmpeg_libs() -> None:
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


def _height_filter(quality: str) -> str:
    height = {"1080": 1080, "720": 720, "480": 480}.get(quality)
    return f"[height<={height}]" if height else ""


def _audio_opts(outdir: Path, container: str, codec: str) -> dict:
    outtmpl = str(outdir / "%(title)s [%(id)s].%(ext)s")
    preferred = "mp3" if container == "mp3" else "m4a"
    ffmpeg = has_ffmpeg()

    if codec == "compatible" and container == "m4a":
        fmt = "bestaudio[ext=m4a]/bestaudio/best"
    elif codec == "compatible" and container == "mp3":
        fmt = "bestaudio/best"
    else:
        fmt = "bestaudio/best"

    opts: dict = {
        "format": fmt,
        "outtmpl": outtmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }
    if ffmpeg:
        opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": preferred,
                "preferredquality": "192",
            }
        ]
    return opts


def _video_opts(outdir: Path, quality: str, container: str, codec: str) -> dict:
    h = _height_filter(quality)
    ffmpeg = has_ffmpeg()
    outtmpl = str(outdir / "%(title)s [%(id)s].%(ext)s")

    if not ffmpeg:
        # Single-file fallback when merge is unavailable.
        if container == "webm":
            fmt = (
                f"best[ext=webm][acodec!=none][vcodec!=none]{h}/"
                f"best[acodec!=none][vcodec!=none]{h}/best"
            )
        else:
            fmt = (
                f"best[ext=mp4][acodec!=none][vcodec!=none]{h}/"
                f"best[acodec!=none][vcodec!=none]{h}/best"
            )
        return {
            "format": fmt,
            "outtmpl": outtmpl,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
        }

    if container == "webm":
        if codec == "compatible":
            fmt = (
                f"bv*[ext=webm][vcodec^=vp9]{h}+ba[ext=webm]/"
                f"bv*[ext=webm]{h}+ba/"
                f"b[ext=webm]{h}/"
                f"bv*{h}+ba/b{h}/b"
            )
            sort = ["res", "vcodec:vp9", "acodec:opus", "ext:webm"]
        else:
            fmt = f"bv*{h}+ba/b{h}/b"
            sort = ["res", "ext:webm"]
        return {
            "format": fmt,
            "format_sort": sort,
            "outtmpl": outtmpl,
            "merge_output_format": "webm",
            "postprocessors": [
                {"key": "FFmpegVideoRemuxer", "preferedformat": "webm"},
            ],
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
        }

    # MP4
    if codec == "compatible":
        fmt = (
            f"bv*[ext=mp4][vcodec^=avc1]{h}+ba[ext=m4a]/"
            f"bv*[ext=mp4]{h}+ba[ext=m4a]/"
            f"b[ext=mp4]{h}/"
            f"bv*{h}+ba/b{h}/b"
        )
        sort = ["res", "vcodec:h264", "acodec:aac", "ext:mp4:m4a"]
    else:
        fmt = f"bv*{h}+ba/b{h}/b"
        sort = ["res", "ext:mp4:m4a"]

    return {
        "format": fmt,
        "format_sort": sort,
        "outtmpl": outtmpl,
        "merge_output_format": "mp4",
        "postprocessors": [
            {"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"},
        ],
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
    }


def build_opts(
    outdir: Path,
    quality: str,
    container: str = "mp4",
    codec: str = "compatible",
    progress_file: Path | None = None,
    start: float | None = None,
    end: float | None = None,
) -> dict:
    outdir.mkdir(parents=True, exist_ok=True)
    container = (container or "mp4").lower()
    codec = (codec or "compatible").lower()

    if container in {"mp3", "m4a"}:
        opts = _audio_opts(outdir, container, codec)
    else:
        opts = _video_opts(outdir, quality, container, codec)

    if start is not None or end is not None:
        from yt_dlp.utils import download_range_func

        start_s = float(start or 0)
        end_s = float(end) if end is not None else float("inf")
        if end_s <= start_s:
            raise ValueError("Clip end must be greater than start.")
        opts["download_ranges"] = download_range_func(None, [(start_s, end_s)])
        opts["force_keyframes_at_cuts"] = True

    if progress_file is not None:
        opts["progress_hooks"] = [_make_progress_hook(progress_file)]

    return opts


def _write_progress(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload), encoding="utf-8")
    tmp.replace(path)


def _make_progress_hook(progress_file: Path):
    def hook(d: dict) -> None:
        status = d.get("status")
        if status == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            percent = 0.0
            if total:
                percent = min(99.0, round(downloaded * 100 / total, 1))
            elif d.get("_percent_str"):
                try:
                    percent = float(str(d["_percent_str"]).replace("%", "").strip())
                except ValueError:
                    percent = 0.0
            _write_progress(
                progress_file,
                {
                    "status": "downloading",
                    "percent": percent,
                    "downloaded_bytes": downloaded,
                    "total_bytes": total or None,
                    "speed": d.get("speed"),
                    "eta": d.get("eta"),
                },
            )
        elif status == "finished":
            _write_progress(
                progress_file,
                {
                    "status": "processing",
                    "percent": 99.0,
                    "downloaded_bytes": d.get("downloaded_bytes"),
                    "total_bytes": d.get("total_bytes"),
                },
            )

    return hook


def _should_extract_playlist(url: str) -> bool:
    from urllib.parse import parse_qs, urlparse

    parsed = urlparse(url)
    path = (parsed.path or "").lower()
    query = parse_qs(parsed.query or "")
    if "playlist" in path:
        return True
    # list= without a specific video id → playlist/mix landing URL
    if "list" in query and "v" not in query:
        return True
    return False


def _entry_thumbnail(entry: dict) -> str | None:
    thumbnails = entry.get("thumbnails") or []
    if entry.get("thumbnail"):
        return entry["thumbnail"]
    if thumbnails:
        return thumbnails[-1].get("url")
    video_id = entry.get("id")
    if video_id:
        return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    return None


def _normalize_video(info: dict, fallback_url: str) -> dict:
    duration = info.get("duration")
    return {
        "type": "video",
        "id": info.get("id"),
        "title": info.get("title") or "Untitled",
        "channel": info.get("channel") or info.get("uploader"),
        "duration": duration,
        "duration_string": info.get("duration_string") or _format_duration(duration),
        "thumbnail": _entry_thumbnail(info),
        "webpage_url": info.get("webpage_url")
        or info.get("url")
        or (
            f"https://www.youtube.com/watch?v={info['id']}"
            if info.get("id")
            else fallback_url
        ),
        "view_count": info.get("view_count"),
        "live_status": info.get("live_status"),
    }


def fetch_info(url: str, *, max_entries: int = 50) -> dict:
    ensure_ffmpeg_libs()
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "noplaylist": not _should_extract_playlist(url),
    }
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if not info:
        raise RuntimeError("Could not fetch video metadata.")

    entries = info.get("entries")
    is_playlist = info.get("_type") == "playlist" or (
        isinstance(entries, list) and len(entries) > 1
    )

    if is_playlist:
        videos: list[dict] = []
        for entry in entries or []:
            if not entry:
                continue
            video_id = entry.get("id")
            if not video_id and isinstance(entry.get("url"), str):
                # Flat entries sometimes only expose a URL/id-like string.
                maybe = entry["url"]
                if maybe.startswith("http"):
                    video_id = None
                else:
                    video_id = maybe
            webpage = entry.get("url") or entry.get("webpage_url")
            if video_id and (not webpage or not str(webpage).startswith("http")):
                webpage = f"https://www.youtube.com/watch?v={video_id}"
            if not webpage:
                continue
            duration = entry.get("duration")
            videos.append(
                {
                    "id": video_id,
                    "title": entry.get("title") or "Untitled",
                    "channel": entry.get("channel")
                    or entry.get("uploader")
                    or info.get("channel")
                    or info.get("uploader"),
                    "duration": duration,
                    "duration_string": entry.get("duration_string")
                    or _format_duration(duration),
                    "thumbnail": _entry_thumbnail(entry),
                    "webpage_url": webpage,
                }
            )

        limited = videos[: max(1, max_entries)]
        return {
            "type": "playlist",
            "id": info.get("id"),
            "title": info.get("title") or "Playlist",
            "channel": info.get("channel") or info.get("uploader"),
            "thumbnail": _entry_thumbnail(info)
            or (limited[0]["thumbnail"] if limited else None),
            "webpage_url": info.get("webpage_url") or url,
            "entry_count": len(videos),
            "entries": limited,
            "truncated": len(videos) > len(limited),
        }

    # Single-video result (possibly a one-item playlist wrapper).
    if isinstance(entries, list) and len(entries) == 1 and entries[0]:
        return _normalize_video(entries[0], url)

    return _normalize_video(info, url)


def _format_duration(seconds: int | float | None) -> str | None:
    if seconds is None:
        return None
    total = int(seconds)
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def parse_timestamp(value: str | float | int | None) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    if text.replace(".", "", 1).isdigit():
        return float(text)
    parts = text.split(":")
    try:
        nums = [float(p) for p in parts]
    except ValueError as exc:
        raise ValueError(f"Invalid timestamp: {value}") from exc
    if len(nums) == 3:
        return nums[0] * 3600 + nums[1] * 60 + nums[2]
    if len(nums) == 2:
        return nums[0] * 60 + nums[1]
    if len(nums) == 1:
        return nums[0]
    raise ValueError(f"Invalid timestamp: {value}")


def download(
    url: str,
    outdir: Path,
    quality: str,
    container: str = "mp4",
    codec: str = "compatible",
    progress_file: Path | None = None,
    start: float | None = None,
    end: float | None = None,
) -> Path | None:
    ensure_ffmpeg_libs()
    if progress_file is not None:
        _write_progress(progress_file, {"status": "starting", "percent": 0})

    opts = build_opts(
        outdir,
        quality,
        container,
        codec,
        progress_file,
        start=start,
        end=end,
    )
    audio_container = container in {"mp3", "m4a"}

    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if not info:
            return None
        requested = info.get("requested_downloads") or []
        if requested and requested[0].get("filepath"):
            path = Path(requested[0]["filepath"])
        else:
            filename = ydl.prepare_filename(info)
            if audio_container and has_ffmpeg():
                filename = str(Path(filename).with_suffix(f".{container}"))
            elif info.get("ext") and not audio_container:
                filename = str(Path(filename).with_suffix(f".{info['ext']}"))
            path = Path(filename)
            if not audio_container and opts.get("merge_output_format"):
                merged = path.with_suffix(f".{opts['merge_output_format']}")
                if merged.exists():
                    path = merged

    if progress_file is not None:
        _write_progress(
            progress_file,
            {
                "status": "finished",
                "percent": 100,
                "path": str(path) if path else None,
                "title": (info or {}).get("title"),
            },
        )
    return path


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
        "-f",
        "--format",
        choices=["mp4", "webm", "mp3", "m4a"],
        default="mp4",
        help="Output format/container (default: mp4)",
    )
    parser.add_argument(
        "--codec",
        choices=["compatible", "best"],
        default="compatible",
        help="Codec preference: compatible (widely playable) or best quality",
    )
    parser.add_argument(
        "--start",
        default=None,
        help="Clip start time in seconds or HH:MM:SS / MM:SS",
    )
    parser.add_argument(
        "--end",
        default=None,
        help="Clip end time in seconds or HH:MM:SS / MM:SS",
    )
    parser.add_argument(
        "-a",
        "--audio-only",
        action="store_true",
        help="Deprecated: same as --format mp3",
    )
    parser.add_argument(
        "--info",
        action="store_true",
        help="Fetch metadata only and print JSON to stdout",
    )
    parser.add_argument(
        "--max-entries",
        type=int,
        default=50,
        help="Max playlist entries to return with --info (default: 50)",
    )
    parser.add_argument(
        "--progress-file",
        type=Path,
        default=None,
        help="Write download progress JSON to this path",
    )
    parser.add_argument(
        "--result-file",
        type=Path,
        default=None,
        help="Write final result JSON to this path",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    ensure_ffmpeg_libs()

    container = args.format
    if args.audio_only and container == "mp4":
        container = "mp3"

    try:
        if args.info:
            print(json.dumps(fetch_info(args.url, max_entries=args.max_entries)))
            return 0

        path = download(
            args.url,
            args.output,
            args.quality,
            container,
            args.codec,
            args.progress_file,
            start=parse_timestamp(args.start),
            end=parse_timestamp(args.end),
        )
    except DownloadError as exc:
        print(f"Download failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    payload = {
        "path": str(path) if path else None,
        "filename": path.name if path else None,
        "extension": path.suffix.lstrip(".") if path else None,
        "size": path.stat().st_size if path and path.exists() else None,
    }
    if args.result_file is not None:
        args.result_file.parent.mkdir(parents=True, exist_ok=True)
        args.result_file.write_text(json.dumps(payload), encoding="utf-8")

    if path:
        print(f"Saved to: {path}")
    else:
        print("Download finished, but output path could not be determined.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
