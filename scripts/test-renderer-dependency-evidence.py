"""Offline adversarial checks for the release fingerprint, no renderer launch."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('evidence', Path(__file__).with_name('renderer-dependency-evidence.py'))
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class RendererEvidenceTests(unittest.TestCase):
    def test_only_engine_directory_is_excluded(self):
        before = Path('scripts/evidence-baselines/worker-v0635.py').read_text(encoding='utf8')
        after = Path('host/raster/worker.py').read_text(encoding='utf8')
        self.assertEqual(evidence.behavior(before), evidence.behavior(after))
        with self.assertRaisesRegex(ValueError, 'Unaudited'):
            evidence.behavior(after.replace('/ "engines"', '/ "wrong"'))
        self.assertNotEqual(evidence.behavior(before), evidence.behavior(after.replace('    return value\n', '    return value + 1\n')))

    def test_nested_code_and_exception_semantics_remain_bound(self):
        old = compile('def f():\n try:\n  return 1\n except Exception:\n  return 2\n', 'old.py', 'exec')
        formatting = compile('\n\ndef f():\n try:\n  return 1\n except Exception:\n  return 2\n', 'new.py', 'exec')
        changed = compile('def f():\n try:\n  return 1\n except Exception:\n  return 3\n', 'new.py', 'exec')
        self.assertEqual(evidence.canonical_code(old), evidence.canonical_code(formatting))
        self.assertNotEqual(evidence.canonical_code(old), evidence.canonical_code(changed))


if __name__ == '__main__':
    unittest.main()
