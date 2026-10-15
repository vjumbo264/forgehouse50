with open('/app/repos/forgehouse50/public/assets/index-D8tlLa-P.css', 'r') as f:
    css = f.read()

nav_css = """
/* Item 3 Nav Contrast Tokens & Badges */
.nav-pill-selected,
.bg-\\[\\#2E6B4F\\] {
  background-color: #2e6b4f !important;
}
.text-white {
  color: #ffffff !important;
}
.nav-pill-unselected,
.text-\\[\\#414942\\] {
  color: #414942 !important;
}
.text-\\[\\#785D15\\] {
  color: #785d15 !important;
}

@media (prefers-color-scheme: dark) {
  .nav-pill-selected,
  .dark\\:bg-\\[\\#8CD8AC\\] {
    background-color: #8cd8ac !important;
  }
  .dark\\:text-\\[\\#003820\\] {
    color: #003820 !important;
  }
  .nav-pill-unselected,
  .dark\\:text-\\[\\#C1C9C0\\] {
    color: #c1c9c0 !important;
  }
}
"""
css += nav_css
with open('/app/repos/forgehouse50/public/assets/index-D8tlLa-P.css', 'w') as f:
    f.write(css)

print('Updated index-D8tlLa-P.css')

with open('/app/repos/forgehouse50/public/assets/index-CQfSSHWX.js', 'r') as f:
    js = f.read()

target1 = '${i?`bg-[#1D6460] text-white shadow-sm font-medium gap-1.5 px-3.5 py-1.5`:`text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 p-2 min-w-[44px]`}'
repl1 = '${i?`bg-[#2E6B4F] text-white dark:bg-[#8CD8AC] dark:text-[#003820] shadow-sm font-semibold gap-1.5 px-3.5 py-1.5`:`text-[#414942] dark:text-[#C1C9C0] hover:text-neutral-900 dark:hover:text-neutral-100 p-2 min-w-[44px]`}'

assert target1 in js, 'target1 not found in js'
js = js.replace(target1, repl1, 1)

target2 = 'className:`w-5 h-5 flex-shrink-0 ${i?`text-white`:``}`'
repl2 = 'className:`w-5 h-5 flex-shrink-0 ${i?`text-white dark:text-[#003820]`:``}`'
assert target2 in js, 'target2 not found in js'
js = js.replace(target2, repl2, 1)

target3 = 'className:`text-xs font-semibold whitespace-nowrap tracking-tight text-white`'
repl3 = 'className:`text-xs font-semibold whitespace-nowrap tracking-tight text-white dark:text-[#003820]`'
assert target3 in js, 'target3 not found in js'
js = js.replace(target3, repl3, 1)

# Also update gold badge color for contrast
js = js.replace('#8A6D1F', '#785D15')

with open('/app/repos/forgehouse50/public/assets/index-CQfSSHWX.js', 'w') as f:
    f.write(js)

print('Updated index-CQfSSHWX.js')

with open('/app/repos/forgehouse50/public/sw.js', 'r') as f:
    sw = f.read()

sw = sw.replace('fh50-v2-04', 'fh50-v2-05')
with open('/app/repos/forgehouse50/public/sw.js', 'w') as f:
    f.write(sw)

print('Updated sw.js to fh50-v2-05')
