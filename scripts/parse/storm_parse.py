"""
STORM Parse API - Document Conversion Script
Uses Sionic AI's STORM Parse API to convert documents to Markdown.

Supported formats: PDF, DOCX, DOC, PPTX, PPT, PNG, JPG, JPEG, HWP, HWPX, XLSX, XLS, CSV

API Documentation: https://storm-apis.apidog.io/
"""

import requests
import json
import time
import os
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = Path(__file__).parent


def _load_env_file(env_path: Path) -> dict:
    """Parse a .env file into a dict without touching os.environ. Never raises."""
    result = {}
    try:
        for line in env_path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, val = line.partition('=')
            result[key.strip()] = val.strip().strip('"').strip("'")
    except OSError:
        pass
    return result


def _load_config_keys() -> dict:
    """Read the `api_keys` block from the plugin config.json.

    Primary:  ~/.claude/paper-autopilot-open/config.json
    Fallback: ~/.claude/paper-autopilot/config.json  (legacy plugin name)
    Returns {} on a missing / malformed file (never raises).
    """
    home = os.environ.get('HOME') or os.environ.get('USERPROFILE') or str(Path.home())
    candidates = [
        Path(home) / '.claude' / 'paper-autopilot-open' / 'config.json',
        Path(home) / '.claude' / 'paper-autopilot' / 'config.json',
    ]
    for cfg_path in candidates:
        if not cfg_path.exists():
            continue
        try:
            cfg = json.loads(cfg_path.read_text(encoding='utf-8'))
            return cfg.get('api_keys', {}) or {}
        except (ValueError, OSError):
            continue
    return {}


def resolve_storm_key():
    """STORM key priority: (1) config.json api_keys.storm_parse → (2) scripts .env → (3) process.env."""
    cfg_keys = _load_config_keys()
    if cfg_keys.get('storm_parse'):
        return cfg_keys['storm_parse']
    for env_path in (SCRIPT_DIR / '.env', SCRIPT_DIR.parent / '.env'):
        env = _load_env_file(env_path)
        if env.get('STORM_PARSE_API_KEY'):
            return env['STORM_PARSE_API_KEY']
    return os.environ.get('STORM_PARSE_API_KEY')


def resolve_storm_language():
    """Language priority mirrors the key: config → scripts .env → process.env → 'en'."""
    cfg_keys = _load_config_keys()
    if cfg_keys.get('storm_parse_language'):
        return cfg_keys['storm_parse_language']
    for env_path in (SCRIPT_DIR / '.env', SCRIPT_DIR.parent / '.env'):
        env = _load_env_file(env_path)
        if env.get('STORM_PARSE_LANGUAGE'):
            return env['STORM_PARSE_LANGUAGE']
    return os.environ.get('STORM_PARSE_LANGUAGE', 'en')


class StormParser:
    """STORM Parse API Client"""

    # API Endpoints
    UPLOAD_URL = "https://storm-apis.sionic.im/parse-router/api/v2/parse/by-file"
    JOB_URL = "https://storm-apis.sionic.im/parse-router/api/v2/parse/job/{job_id}"

    SUPPORTED_FORMATS = {'.pdf', '.docx', '.doc', '.pptx', '.ppt',
                         '.png', '.jpg', '.jpeg', '.hwp', '.hwpx', '.xlsx', '.xls', '.csv'}

    def __init__(self, api_key: str = None, language: str = None):
        """
        Args:
            api_key: STORM API auth key (Bearer token). Loads from env if None
            language: Parsing language (default: en from env)
        """
        self.api_key = api_key or resolve_storm_key()
        self.language = language or resolve_storm_language()

        if not self.api_key:
            raise ValueError(
                "STORM_PARSE_API_KEY is required. Set it in "
                "~/.claude/paper-autopilot-open/config.json (api_keys.storm_parse), "
                "scripts/.env (STORM_PARSE_API_KEY), or the environment; or pass it directly."
            )

        self.headers = {
            "Authorization": f"Bearer {self.api_key}"
        }

    def parse_document(self, file_path: str, poll_interval: float = 2.0, max_wait: int = 300) -> dict:
        """
        Parse document and convert to structured data.

        Args:
            file_path: Path to document file
            poll_interval: Polling interval in seconds
            max_wait: Maximum wait time in seconds

        Returns:
            dict: API response (contains pages array)
        """
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        if path.suffix.lower() not in self.SUPPORTED_FORMATS:
            raise ValueError(
                f"Unsupported file format: {path.suffix}\n"
                f"Supported: {', '.join(self.SUPPORTED_FORMATS)}"
            )

        print(f"[UPLOAD] Uploading: {path.name}")

        with open(path, 'rb') as f:
            files = {'file': (path.name, f)}
            data = {
                'language': self.language,
                'deleteOriginFile': 'true'
            }
            response = requests.post(
                self.UPLOAD_URL,
                headers=self.headers,
                files=files,
                data=data,
                timeout=120
            )

        if response.status_code != 200:
            try:
                error_msg = response.json().get('message', response.text)
            except ValueError:
                # Non-JSON error body (HTML gateway page, plain text, etc.)
                error_msg = response.text[:500]
            raise requests.HTTPError(
                f"Upload failed: HTTP {response.status_code} - {error_msg}"
            )

        result = response.json()
        job_id = result.get('jobId')
        print(f"[OK] Upload complete - Job ID: {job_id}")

        print(f"[WAIT] Processing...")
        start_time = time.time()

        while True:
            elapsed = time.time() - start_time
            if elapsed > max_wait:
                raise TimeoutError(f"Processing timeout ({max_wait}s)")

            job_response = requests.get(
                self.JOB_URL.format(job_id=job_id),
                headers=self.headers,
                timeout=30
            )

            if job_response.status_code != 200:
                raise requests.HTTPError(f"Status check failed: {job_response.text}")

            job_result = job_response.json()
            state = job_result.get('state', 'UNKNOWN')

            if state == 'COMPLETED':
                print(f"[OK] Complete! ({elapsed:.1f}s)")
                return job_result
            elif state in ['FAILED', 'ERROR']:
                raise RuntimeError(f"Parsing failed: {job_result}")
            else:
                print(f"[...] {state} ({elapsed:.1f}s)")
                time.sleep(poll_interval)

    def parse_and_save(self, file_path: str, output_dir: str = None) -> str:
        """Parse document and save as Markdown file."""
        path = Path(file_path)
        result = self.parse_document(file_path)

        if output_dir:
            output_path = Path(output_dir) / f"{path.stem}.md"
        else:
            output_path = path.with_suffix('.md')

        markdown_content = self._format_result(result, path.name)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(markdown_content, encoding='utf-8')

        print(f"[SAVE] Saved: {output_path}")
        return str(output_path)

    def parse_to_dict(self, file_path: str) -> dict:
        """Parse document and return structured dictionary."""
        result = self.parse_document(file_path)

        return {
            'pages': result.get('pages', []),
            'metadata': {
                'job_id': result.get('jobId'),
                'state': result.get('state'),
                'source_file': str(Path(file_path).name),
                'language': self.language,
                'parsed_at': datetime.now().isoformat()
            },
            'raw_response': result
        }

    def _format_result(self, result: dict, source_name: str) -> str:
        """Format API result as Markdown"""
        lines = [
            f"# {source_name}",
            "",
            f"> Converted via STORM Parse API | {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"> Job ID: {result.get('jobId', 'N/A')}",
            "",
            "---",
            ""
        ]

        pages = result.get('pages', [])
        for page in pages:
            page_num = page.get('pageNumber', '?')
            content = page.get('content', '')

            if len(pages) > 1:
                lines.append(f"## Page {page_num}")
                lines.append("")

            lines.append(content)
            lines.append("")
            lines.append("---")
            lines.append("")

        return '\n'.join(lines)


def main():
    """Main function for CLI usage"""
    import sys

    # Usage check comes FIRST so `storm_parse.py` with no args prints help even
    # when no API key is configured (instead of a StormParser ValueError trace).
    if len(sys.argv) <= 1:
        print("Usage: python storm_parse.py <file_path> [output_dir]")
        print("  API key and language loaded from config.json / .env / environment")
        return

    file_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    # Construct the client only after we know we have work to do; surface a
    # missing key as a friendly message rather than an unhandled traceback.
    try:
        parser = StormParser()
    except ValueError as e:
        print(f"[ERROR] {e}")
        return

    try:
        output_file = parser.parse_and_save(file_path, output_dir)
        print(f"\n[SUCCESS] Done! Output: {output_file}")
    except Exception as e:
        print(f"[ERROR] {e}")


if __name__ == "__main__":
    main()
