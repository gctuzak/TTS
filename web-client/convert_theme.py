import os, glob, re

files = glob.glob("src/**/*.tsx", recursive=True)

replacements = {
    "bg-gray-950": "bg-gray-50 dark:bg-gray-950",
    "bg-gray-900": "bg-white dark:bg-gray-900",
    "bg-gray-800": "bg-gray-100 dark:bg-gray-800",
    "border-gray-800": "border-gray-200 dark:border-gray-800",
    "border-gray-700": "border-gray-300 dark:border-gray-700",
    "text-gray-400": "text-gray-600 dark:text-gray-400",
    "text-gray-500": "text-gray-500 dark:text-gray-500",
    
    "bg-slate-900": "bg-slate-50 dark:bg-slate-900",
    "bg-slate-800": "bg-white dark:bg-slate-800",
    "border-slate-800": "border-slate-200 dark:border-slate-800",
    "border-slate-700": "border-slate-200 dark:border-slate-700",
    "border-slate-500": "border-slate-300 dark:border-slate-500",
    "text-slate-400": "text-slate-500 dark:text-slate-400",
    "text-slate-500": "text-slate-600 dark:text-slate-500",
    "text-slate-100": "text-slate-800 dark:text-slate-100",
    
    "text-white": "text-slate-900 dark:text-white",
}

for file in files:
    with open(file, "r") as f:
        content = f.read()
    
    new_content = content
    for old, new in replacements.items():
        if f"dark:{old}" not in new_content:
            new_content = re.sub(r"\b" + old + r"\b", new, new_content)
        
    if new_content != content:
        with open(file, "w") as f:
            f.write(new_content)
        print(f"Updated {file}")