"""Time-leverage system: measure Tim's time and agent waste, rank automation proposals.

Private by construction: events carry a category label, a timestamp, a source and minutes. Message
bodies are classified in memory and dropped. Output lives outside the repo (see store.py).
"""
