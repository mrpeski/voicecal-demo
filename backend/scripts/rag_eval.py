# scripts/eval_rag.py
import asyncio

from voicecal.rag import search

QUERIES = [
    "when did I last meet with Alex?",
    "budget review from a few months ago",
    "that standup where we discussed the migration",
]


async def main():
    for q in QUERIES:
        print(f"\n🔍 {q}")
        results = await search(q, top_k=3)
        for r in results:
            print(f"  • {r['metadata']['title']} ({r['metadata']['start']})")


asyncio.run(main())
