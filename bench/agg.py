import json, sys, os
# Per-session subagent transcript dir (JSONL `<id>.output` files). Override with
# TD_TASKS_DIR. The IDs below are from the original benchmark session, so this
# script only reproduces the exact tables there; elsewhere it documents method.
D=os.environ.get("TD_TASKS_DIR", "./tasks")
# per-1M rates by model family
RATES={"sonnet":(3.0,15.0,0.30,3.75),"haiku":(1.0,5.0,0.10,1.25),"opus":(5.0,25.0,0.50,6.25)}
def rate(m):
    for k,v in RATES.items():
        if k in (m or ""): return v
    return RATES["sonnet"]
def run(tid):
    i=o=cr=cw=0; model=""
    for ln in open(f"{D}/{tid}.output"):
        x=json.loads(ln)
        if x.get("type")=="assistant":
            u=x["message"].get("usage",{}); model=x["message"].get("model",model)
            i+=u.get("input_tokens",0); o+=u.get("output_tokens",0)
            cr+=u.get("cache_read_input_tokens",0); cw+=u.get("cache_creation_input_tokens",0)
    return i,o,cr,cw,model
def bill(i,o,cr,cw,m):
    ri,ro,rcr,rcw=rate(m); return (i*ri+o*ro+cr*rcr+cw*rcw)/1e6
def agg(ids):
    T=[0,0,0,0]; B=0.0; m=""
    for t in ids:
        i,o,cr,cw,mm=run(t); m=mm
        T[0]+=i;T[1]+=o;T[2]+=cr;T[3]+=cw; B+=bill(i,o,cr,cw,mm)
    return T,B,m
def show(label, base_ids, skill_ids):
    # compare PER-RUN MEANS so arms with different n stay comparable
    nb,ns=len(base_ids),len(skill_ids)
    (bi,bo,bcr,bcw),bb,m=agg(base_ids); bi,bo,bcr,bcw,bb=bi/nb,bo/nb,bcr/nb,bcw/nb,bb/nb
    (si,so,scr,scw),sb,_=agg(skill_ids); si,so,scr,scw,sb=si/ns,so/ns,scr/ns,scw/ns,sb/ns
    bt=bi+bo+bcr+bcw; st=si+so+scr+scw
    pc=lambda a,b:f"{100*(a-b)/a:5.1f}%" if a else "  n/a"
    print(f"\n=== {label} (model~{m}; base n={len(base_ids)}, skill n={len(skill_ids)}) ===")
    print(f"{'metric':12}{'baseline':>12}{'skill':>12}{'saved':>8}")
    print(f"{'input':12}{bi:>12,.0f}{si:>12,.0f}{pc(bi,si):>8}")
    print(f"{'output':12}{bo:>12,.0f}{so:>12,.0f}{pc(bo,so):>8}")
    print(f"{'cache_read':12}{bcr:>12,.0f}{scr:>12,.0f}{pc(bcr,scr):>8}")
    print(f"{'cache_write':12}{bcw:>12,.0f}{scw:>12,.0f}{pc(bcw,scw):>8}")
    print(f"{'TOTAL tok':12}{bt:>12,.0f}{st:>12,.0f}{pc(bt,st):>8}")
    print(f"{'BILL $':12}{bb:>12.4f}{sb:>12.4f}{pc(bb,sb):>8}")

show("EXPLORATION (read-heavy)",
     ["aa054d776c2befe16","aab0789e2d3f7a14b","a72319b445d04650b","ac5ca3dad01d44cee"],
     ["a1bbda4f212c2b68e","a6b79b445a3dc68f6","aba790dc269fa9a6a","ac789c98acd04d49c"])
# Change task (generalize isEmpty + tests), clean all-sonnet runs, per-run means.
# baseline n=4, skill (ultra + context discipline + min-turns) n=3.
show("CHANGE (edit + tests) — clean, per-run mean",
     ["aab87449d3b83792b","a9064f9b5cceed645","adfbca7887520021e","a7c152da39cb902a6"],
     ["ac930da88a69f396b","a06a6ebd5a1cd6475","adc2f5e577378fb01"])
# Output-heavy advisory session (4 SWE questions, no tools) — where telegraphing
# hits most of the bill. baseline n=3 vs skill (ultra) n=3, per-run mean.
show("ADVISORY (output-heavy, no tools)",
     ["a8e20803610956d49","a6b3225135d8d0c3a","afb50000ecacefa58"],
     ["a3a1a9fadf7724d63","a06c6fafcb8c42ed5","a492d61e36ce0f9c6"])
