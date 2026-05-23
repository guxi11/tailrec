# use like ccusage

  Total cost:            $0.2756
  Total duration (API):  5s
  Total duration (wall): 20s
  Total code changes:    0 lines added, 0 lines removed
  Usage by model:
       claude-opus-4-6:  24.4k input, 53 output, 0 cache read, 24.4k cache write
  ($0.2756)
  
Resume this session with:
claude --resume 1ecaad90-8d23-4198-bb37-353616f18308
─── tailrec: 2 iterations ───
  #1 48,785→48,785 tok  1 msg  $0.2769
  #2 48,763→48,763 tok  1 msg  $0.2756 (−0.1k ctx)
  Actual: $0.5526  │  No-tailrec est: $0.5531  │  Saved: ~0%

# wrong with hardcode
─── tailrec session: 2 iterations ───
  #1  — 175,912 tok, $0.8516
  #2 hi — 48,868 tok, $0.3307
  Actual: $1.1823  │  Single-session estimate: $0.6858  │  Saved: ~-72%

--- #2 real cost
  Total cost:            $0.2756
  Total duration (API):  4s
  Total duration (wall): 29s
  Total code changes:    0 lines added, 0 lines removed
  Usage by model:
       claude-opus-4-6:  24.4k input, 51 output, 0 cache read, 24.4k cache write
  ($0.2756)
