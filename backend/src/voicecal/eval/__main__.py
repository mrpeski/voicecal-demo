import asyncio

from voicecal.eval.harness import _print_summary, run_evals

if __name__ == "__main__":
    results = asyncio.run(run_evals())
    _print_summary(results)
