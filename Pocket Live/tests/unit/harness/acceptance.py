"""Deterministic tests of the acceptance oracle itself, including false-pass traps."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'harness'))
from acceptance import differences, wait_converged, Evidence, project_remote


class Harness(unittest.TestCase):
    def test_comparator(self):
        self.assertFalse(differences({'n': .1}, {'n': .100001}))
        for left, right in [(True, 1), (float('nan'), float('nan')), ({'a': 1}, {}), ([1, 2], [2, 1]), ([1], [1, 2])]:
            self.assertTrue(differences(left, right))
        with self.assertRaises(KeyError):
            project_remote({})

    def run_observations(self, observe, **kwargs):
        self.now = 0
        def sleep(delay): self.now += delay
        return wait_converged(observe, clock=lambda: self.now, sleep=sleep, timeout=1, stable_for=.2, **kwargs)

    def test_equal_clients_wrong_native_fails(self):
        # Deliberately broken broadcast: every client agrees on the wrong state.
        with self.assertRaises(TimeoutError):
            self.run_observations(lambda: {'Live': {'tempo': 120}, 'A': {'tempo': 100}, 'B': {'tempo': 100}})

    def test_stale_one_client_fails(self):
        with self.assertRaises(TimeoutError):
            self.run_observations(lambda: {'Live': 120, 'A': 120, 'B': 110, 'C': 120})

    def test_ack_without_native_mutation_fails(self):
        with self.assertRaises(TimeoutError):
            self.run_observations(lambda: {'Live': 120, 'A': 120}, expected=130)

    def test_momentary_agreement_does_not_pass(self):
        with self.assertRaises(TimeoutError):
            self.run_observations(lambda: {'Live': 120, 'A': 120 if self.now == 0 else 110})

    def test_continuously_changing_equal_states_do_not_pass(self):
        with self.assertRaises(TimeoutError):
            self.run_observations(lambda: {'Live': self.now, 'A': self.now})

    def test_eventual_stable_agreement(self):
        result = self.run_observations(lambda: {'Live': 120, 'A': 120 if self.now > .3 else 110, 'B': 120, 'C': 120})
        self.assertGreater(result['observations'], 3)

    def test_no_oracle_no_pass(self):
        with self.assertRaises(ValueError):
            self.run_observations(lambda: {'A': 120, 'B': 120})

    def test_trace_rejects_secrets(self):
        with self.assertRaises(ValueError):
            Evidence().add('connect', url='private#token')


if __name__ == '__main__': unittest.main()
