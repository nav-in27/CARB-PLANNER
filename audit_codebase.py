import os
import re

patterns = {
    'localhost': re.compile(r'localhost', re.IGNORECASE),
    '127.0.0.1': re.compile(r'127\.0\.0\.1'),
    '0.0.0.0': re.compile(r'0\.0\.0\.0'),
    ':8000': re.compile(r':8000'),
    ':5173': re.compile(r':5173'),
    ':3000': re.compile(r':3000'),
    'sqlite': re.compile(r'sqlite', re.IGNORECASE),
    'google_maps_key': re.compile(r'AIza[0-9A-Za-z-_]{35}'),
    'hardcoded_db_url': re.compile(r'postgres(ql)?://[^\s\"\'\)]+'),
}

ignore_dirs = {'.git', 'node_modules', '.pytest_cache', '__pycache__', 'dist', '.agents'}

results = {k: [] for k in patterns}

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ignore_dirs]
    for f in files:
        if f.endswith(('.py', '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.env', '.example', '.yml', '.yaml', '.toml')):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    for line_no, line in enumerate(fp, 1):
                        for k, pat in patterns.items():
                            if pat.search(line):
                                results[k].append((path, line_no, line.strip()))
            except Exception as e:
                pass

for k, matches in results.items():
    print(f'=== {k}: {len(matches)} matches ===')
    for m in matches[:15]:
        print(f'  {m[0]}:{m[1]} -> {m[2][:120]}')
    if len(matches) > 15:
        print(f'  ... and {len(matches) - 15} more')
