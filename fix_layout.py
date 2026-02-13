import os

file_path = r'c:\Users\Lim\Desktop\mirror-project\src\app\school\layout.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "name.includes('헬스케어')" in line and "HealthCare" not in line:
        line = line.replace("name.includes('헬스케어')", "name.includes('헬스케어') || name.includes('HealthCare')")
    if "name.includes('심박계')" in line and "HeartCare" not in line:
        line = line.replace("name.includes('심박계')", "name.includes('심박계') || name.includes('HeartCare')")
    new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Modification attempt finished")
