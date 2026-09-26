TEMPLATES = {
    "en": {
        "WATCH": "Conditions are favorable for hazards. Exercise caution.",
        "WARNING": "Be prepared to evacuate. Move away from steep slopes.",
        "EMERGENCY": "EVACUATE IMMEDIATELY to higher ground."
    },
    "hi": {
        "WATCH": "खतरों के लिए परिस्थितियां अनुकूल हैं। सावधानी बरतें।",
        "WARNING": "निकासी के लिए तैयार रहें। खड़ी ढलानों से दूर चले जाएं।",
        "EMERGENCY": "तुरंत ऊंचाई वाले स्थानों पर जाएं।"
    },
    "ne": {
        "WATCH": "खतराहरूको लागि अवस्थाहरू अनुकूल छन्। सावधानी अपनाउनुहोस्।",
        "WARNING": "निकासीको लागि तयार रहनुहोस्। ठाडो भिरालोबाट टाढा जानुहोस्।",
        "EMERGENCY": "तुरुन्तै उच्च स्थानमा जानुहोस्।"
    },
    "bn": {
        "WATCH": "বিপদের সম্ভাবনা রয়েছে। সতর্ক থাকুন।",
        "WARNING": "সরে যাওয়ার জন্য প্রস্তুত থাকুন। খাড়া ঢাল থেকে দূরে সরে যান।",
        "EMERGENCY": "অবিলম্বে উঁচু স্থানে চলে যান।"
    }
}

def get_template(lang: str, level: str) -> str:
    return TEMPLATES.get(lang, TEMPLATES["en"]).get(level, "Stay safe.")
