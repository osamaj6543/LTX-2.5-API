"""LTX-2.5 generation API.

A FastAPI wrapper around the official ``ltx_pipelines`` command-line pipelines:
:class:`~ltx_pipelines.distilled.DistilledPipeline` and
:class:`~ltx_pipelines.ti2vid_two_stages.TI2VidTwoStagesPipeline`.

The API translates JSON requests into the exact CLI argv of those pipelines and
parses them with the official argparse parsers, so behaviour (validation,
defaults, errors) is identical to running ``python -m ltx_pipelines.distilled``
or ``python -m ltx_pipelines.ti2vid_two_stages`` from the command line.
"""

__version__ = "0.1.0"
