import re

BUNDLE_PATH = '/tmp/repos/forgehouse50/public/assets/index-CQfSSHWX.js'

with open(BUNDLE_PATH, 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Add NT books constant if not present
if 'const NT_BOOKS_LIST=' not in js:
    nt_books_def = 'const NT_BOOKS_LIST=["Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];'
    js = nt_books_def + js
    print("Added NT_BOOKS_LIST")

# 2. Update gt: Notes View
# Find state declaration in gt:
# let[r,i]=(0,_.useState)([])...,[ie,ae]=(0,_.useState)(!1);
pattern_gt_state = re.compile(r'(let\[r,i\]=\(0,_\.useState\)\(\[\]\),.*?\[ie,ae\]=\(0,_\.useState\)\(!1\))')
m = pattern_gt_state.search(js)
if m:
    if '[showName,setShowName]' not in m.group(1):
        js = js[:m.end(1)] + ',[showName,setShowName]=(0,_.useState)(!1)' + js[m.end(1):]
        print("Added showName state to gt")

# 3. Add Community card & Announcement card to HomeView ct
# Let's inspect where HomeView ct sets up useEffect
pattern_ct_state = re.compile(r'(ct=\(\{user:e,todayData:t,onNavigate:n,onStartReading:r\}\)=>\{let i=.*?;)')
m_ct = pattern_ct_state.search(js)
if m_ct:
    if 'latestCommPost' not in m_ct.group(1):
        addition = ',[latestCommPost,setLatestCommPost]=(0,_.useState)(null),[latestAnnounce,setLatestAnnounce]=(0,_.useState)(null);(0,_.useEffect)(()=>{fetch("/api/community/latest").then(r=>r.ok?r.json():null).then(d=>d&&d.post&&setLatestCommPost(d.post)).catch(()=>{});fetch("/api/announcements/latest").then(r=>r.ok?r.json():null).then(d=>d&&d.announcement&&setLatestAnnounce(d.announcement)).catch(()=>{});},[]);'
        js = js[:m_ct.end(1)-1] + addition + js[m_ct.end(1):]
        print("Added latestCommPost and latestAnnounce states & fetch to HomeView ct")

with open(BUNDLE_PATH, 'w', encoding='utf-8') as f:
    f.write(js)

print("Finished script update")
