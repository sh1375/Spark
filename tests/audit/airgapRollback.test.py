# Exercises the real transaction helpers, not the privileged installer.
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2] / 'deploy/spark-cli/bootstrap-full-source-airgap.sh'
BASH = os.environ.get('SPARK_TEST_BASH') or shutil.which('bash')
if os.name == 'nt':
    git_bash = Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / 'Git/bin/bash.exe'
    if git_bash.is_file():
        BASH = str(git_bash)

class RollbackTests(unittest.TestCase):
    def run_case(self, scenario):
        self.assertTrue(BASH, 'Bash is required for rollback acceptance')
        source = SOURCE.read_text(encoding='utf-8')
        helpers = source[source.index('path_exists() {'):source.index('resolve_migrate_dir() {')]
        finish = source[source.index('finish_install() {'):source.index('install -d -m 0755 /opt')]
        # Never evaluate the complete installer or real system paths.
        with tempfile.TemporaryDirectory(prefix='spark-rollback-') as tmp:
            script = Path(tmp) / 'case.sh'
            script.write_text('set -Eeuo pipefail\n' + helpers + '\n' + finish + '''
cd -- "$(dirname -- "$0")"
mkdir current staged
printf old >current/marker
printf new >staged/marker
trap finish_install EXIT
''' + scenario, encoding='utf8', newline='\n')
            proc = subprocess.run([BASH, '--noprofile', '--norc', str(script)], capture_output=True, text=True, timeout=15)
            return proc.returncode, (Path(tmp)/'current/marker').read_text(), (Path(tmp)/'staged/marker').exists()
    def test_failure_after_backup(self):
        status, marker, staged = self.run_case('save_previous current\nexit 7\n')
        self.assertEqual((status, marker, staged), (7, 'old', True))
    def test_failure_after_publication(self):
        status, marker, staged = self.run_case('save_previous current\nrecord_move staged current\nexit 8\n')
        self.assertEqual((status, marker, staged), (8, 'old', True))
    def test_failure_immediately_after_rename_before_return(self):
        status, marker, staged = self.run_case('''
save_previous current
# Simulate the rename succeeding but the caller observing failure, before the
# original implementation recorded the completed move.
mv() {
  command mv "$@"
  if [[ "$*" == *"staged current"* ]]; then return 9; fi
}
record_move staged current
''')
        self.assertNotEqual(status, 0)
        self.assertEqual(marker, 'old')
        self.assertTrue(staged)
    def test_commit_preserves_new_install(self):
        status, marker, staged = self.run_case('save_previous current\nrecord_move staged current\ncommitted=1\n')
        self.assertEqual((status, marker, staged), (0, 'new', False))

if __name__ == '__main__':
    unittest.main()
