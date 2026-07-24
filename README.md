# SYSTEM // Hunter Interface Dashboard

> **"ARISE."**
> A high-performance, *Solo Leveling*-inspired HUD home page and new-tab dashboard engineered for Zen Browser.

---

## ⚡ Overview

**Hunter Interface** transforms your default browser tab into a Hunter System Status Window. Designed to keep you productive and immersion-focused, it features an integrated quest system, experience-point progression, customizable portals (bookmarks), real-time weather metrics, and webmail integrations.

---

## ✨ System Capabilities

* **Hunter Status & XP Bar:** Track your rank from **E-Rank** to **S-Rank**. Earn XP by completing daily quests to trigger interactive Level-Up notifications and sound effects.


* **Daily Quests (To-Do List):** Add, track, and complete tasks directly from your status window.


* **Dimensional Portals (Bookmarks):** Organized bookmark panels categorized by **Daily Raids**, **System Vault**, and **Guild Links**. Includes support for **S-Rank** highlights.


* **System Search Bar:** Integrated search bar supporting Google, DuckDuckGo, and self-hosted SearXNG. Press `/` anywhere to focus immediately.


* **System Messages (Webmail Integration):** Quick access tabs for Gmail, Outlook, Proton Mail, or custom webmail URLs.


* **Live System Metrics:** Real-time clock and location-based weather tracking powered by Open-Meteo.


* **Cybernetic Visuals:** Built with a cyberpunk/system aesthetic featuring glowing HUD corners, scanlines, animated particle fields, and custom typography (`Rajdhani`, `Orbitron`, and `Inter`).



---

## 🛠️ Built With

* **HTML5 & CSS3**

* **Tailwind CSS** (via CDN)


* **Lucide Icons**

* **Open-Meteo API** (No API key required)


* **Google Fonts** (*Rajdhani*, *Orbitron*, *Inter*)



---

## 🚀 Installation & Setup

1. **Clone or Download:** Clone or download the repository files to your local drive.
2. **Open in Zen Browser:**
* Launch **Zen Browser**.
* Navigate to your Settings/Preferences to configure a custom New Tab page or Homepage.
* Set your New Tab / Homepage URL to point directly to the local `index.html` file path:
```text
file:///path/to/your/index.html

```





---

## ⚙️ Configuration

Click the **Settings Icon** (⚙️) in the top-right status panel to open the **System Configuration** menu:

* **Hunter Name:** Personalize your title.


* **Weather Location:** Input custom latitude and longitude coordinates or click **Use My Location**.


* **Search Engine:** Switch between Google, DuckDuckGo, or set up a custom SearXNG instance URL.


* **Custom Webmail:** Route the webmail tab directly to your self-hosted or preferred email provider.


* **Reset System Data:** Reset all quests, XP levels, and portals back to factory defaults.



---

## ⌨️ System Shortcuts

| Key | Action |
| --- | --- |
| `/` | Instantly focus the **System Search** bar

 |
| `Esc` | Unfocus search or close open modal windows

 |
| `Enter` / `Space` | Toggle quest status when focused on a checkbox

 |

---

## 💾 Local Storage

All system data—including your rank, current XP, active quests, and customized portals—is stored locally inside your browser via `localStorage`. No external account creation or database server is required.
