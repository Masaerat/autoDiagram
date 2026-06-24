#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Persistent faster-whisper worker using JSON lines over stdin/stdout.")
    parser.add_argument("--model", default="small", help="Whisper model size or local model path. Default: small.")
    parser.add_argument("--language", default="zh", help="Source language code. Default: zh.")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"], help="Inference device.")
    parser.add_argument("--compute-type", default="auto", help="CTranslate2 compute type.")
    parser.add_argument("--beam-size", type=int, default=5, help="Beam size.")
    parser.add_argument("--vad-filter", dest="vad_filter", action="store_true", default=False, help="Enable VAD silence filtering. Requires onnxruntime.")
    parser.add_argument("--no-vad-filter", dest="vad_filter", action="store_false", help="Disable VAD silence filtering.")
    return parser.parse_args()


def import_faster_whisper():
    try:
        from faster_whisper import WhisperModel
    except ModuleNotFoundError:
        print(
            "缺少 faster-whisper 依赖。请先安装: python -m pip install -U faster-whisper",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return WhisperModel


def choose_device_and_compute_type(device: str, compute_type: str) -> tuple[str, str]:
    if device == "auto":
        device = "cpu"
        try:
            import ctranslate2

            if ctranslate2.get_cuda_device_count() > 0:
                device = "cuda"
        except Exception:
            device = "cpu"

    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"

    return device, compute_type


def plain_text(segments: list[TranscriptSegment]) -> str:
    return "\n".join(segment.text.strip() for segment in segments if segment.text.strip())


def write_json(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=True), flush=True)


def transcribe_file(model, input_path: Path, language: str, beam_size: int, vad_filter: bool) -> dict:
    if not input_path.exists() or not input_path.is_file():
        raise FileNotFoundError(f"找不到可转写文件: {input_path}")

    segments_iter, info = model.transcribe(
        str(input_path),
        language=language or None,
        beam_size=beam_size,
        vad_filter=vad_filter,
        condition_on_previous_text=False,
    )
    segments = [
        TranscriptSegment(start=float(item.start), end=float(item.end), text=str(item.text))
        for item in segments_iter
    ]
    return {
        "text": plain_text(segments),
        "language": getattr(info, "language", language),
        "duration": getattr(info, "duration", None),
    }


def main() -> int:
    args = parse_args()
    WhisperModel = import_faster_whisper()
    device, compute_type = choose_device_and_compute_type(args.device, args.compute_type)
    print(f"Loading persistent model {args.model!r} on {device} ({compute_type})...", file=sys.stderr, flush=True)
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    write_json({"type": "ready", "model": args.model, "device": device, "computeType": compute_type})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            request_id = str(request.get("id") or "")
            if request.get("type") == "shutdown":
                write_json({"type": "shutdown", "id": request_id})
                return 0
            input_path = Path(str(request.get("input") or "")).expanduser().resolve()
            payload = transcribe_file(model, input_path, args.language, args.beam_size, args.vad_filter)
            write_json({"type": "result", "id": request_id, **payload})
        except Exception as error:
            write_json({"type": "error", "id": str(locals().get("request_id", "")), "error": f"音视频解码或识别失败: {error}"})

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
