"""Independent, read-only Live API observer through AbletonKernel.

Never uses Pocket Live snapshots, IDs, ACKs or its native Max adapter.
Only one Kernel client may run at a time (legacy discovery has one reply port).
"""
import fcntl
import os
import sys
import tempfile
from pathlib import Path

READ_STATE = '''
def observed_track(t, kind):
    mixer = t.mixer_device
    return dict(kind=kind, name=t.name, mute=False if kind=='master' else bool(t.mute),
        solo=False if kind=='master' else bool(t.solo),
        arm=bool(t.arm) if t.can_be_armed else False,
        volume=float(mixer.volume.value), pan=float(mixer.panning.value),
        sends=[float(p.value) for p in mixer.sends],
        devices=[dict(name=d.name, className=d.class_name, on=float(d.parameters[0].value) if d.parameters else 1)
                 for d in t.devices])
dict(tempo=float(song.tempo), playing=bool(song.is_playing), record=bool(song.record_mode),
     metronome=bool(song.metronome), loop=bool(song.loop), loopStart=float(song.loop_start),
     loopLength=float(song.loop_length), signature=[song.signature_numerator, song.signature_denominator],
     sceneCount=len(song.scenes), tracks=[observed_track(t, 'track') for t in song.tracks] +
     [observed_track(t, 'return') for t in song.return_tracks] + [observed_track(song.master_track, 'master')])
'''


class LiveOracle:
    def __init__(self, timeout=3):
        self.lock = open(Path(tempfile.gettempdir())/'pocket-live-oracle.lock', 'a')
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            checkout = os.environ.get('ABLETON_KERNEL_PATH', str(Path(__file__).resolve().parents[4] / 'ableton-kernel'))
            sys.path.insert(0, checkout)
            from kernel_client import Kernel
            self.kernel = Kernel(timeout=timeout, client_port=0)
        except BaseException:
            self.lock.close()
            raise

    def read(self):
        return self.kernel.exec(READ_STATE, depth=10)

    def close(self):
        self.kernel.close()
        self.lock.close()
