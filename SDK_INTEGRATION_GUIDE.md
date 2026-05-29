# SDK Integration Guide — Gamified Referral & Virality SDK

> כל מה שמפתח ה-Android SDK צריך לדעת על מנת שהחיבור לשרת יעבוד תקין.

---

## 1. אתחול SDK

```kotlin
ReferralSdk.init(
    context   = this,
    apiKey    = "demo_api_key_local_dev",   // x-api-key header
    projectId = "proj_demo_local",          // x-project-id header
    baseUrl   = "http://10.0.2.2:5000"      // כתובת שרת Flask
)
```

### `baseUrl` לפי סביבה

| סביבה | ערך |
|-------|-----|
| אמולטור Android Studio | `http://10.0.2.2:5000` |
| מכשיר פיזי (WiFi מקומי) | `http://192.168.X.X:5000` |
| פרודקשן | `https://your-api-domain.com` |

---

## 2. Headers — חובה בכל בקשה

הכותרות הבאות חייבות להישלח בכל request לשרת:

```http
x-api-key:    demo_api_key_local_dev
x-project-id: proj_demo_local
Content-Type: application/json
```

| קוד תשובה | סיבה |
|-----------|------|
| `401` | אחד מה-headers חסר לגמרי |
| `403` | ה-headers קיימים אך לא תואמים לרשומה ב-DB |

---

## 3. ה-4 Endpoints

### `POST /api/referral/generate`

קורים כשמשתמש קיים רוצה לשתף את האפליקציה עם חבר.

**Request:**
```json
{
  "user_id": "YOUR_INTERNAL_USER_ID"
}
```

**Response:**
```json
{
  "invite_code": "AB3XKT9F",
  "invite_link": "http://your-server.com/r/AB3XKT9F",
  "deep_link":   "referralsdk://invite?code=AB3XKT9F"
}
```

> **חשוב:** אותו `user_id` תמיד יקבל אותו `invite_code` — בטוח לקרוא כמה פעמים.

---

### `POST /api/referral/track`

קוראים כשמשתמש **חדש** נפתח דרך deep link. חייבים לשלוח את `stage` הנכון לכל שלב.

**Request:**
```json
{
  "invite_code":  "AB3XKT9F",
  "new_user_id":  "NEW_USER_ID",
  "stage":        "attributed"
}
```

**Response:**
```json
{
  "status":          "ok",
  "stage":           "attributed",
  "points_awarded":  100,
  "inviter_balance": 100
}
```

#### ערכי `stage` — סדר הקריאות הנכון

```
משתמש A שולח לינק למשתמש B

B לוחץ על הלינק:
  └── stage: "click"       → נרשם ב-Analytics בלבד

B מוריד ומתקין את האפליקציה:
  └── stage: "install"     → נרשם ב-Analytics בלבד

B משלים הרשמה (Registration):
  └── stage: "attributed"  → A מקבל 100 נקודות ✅
```

| stage | מה קורה בשרת |
|-------|--------------|
| `"click"` | נרשם Funnel event בלבד, אין זיכוי נקודות |
| `"install"` | נרשם Funnel event בלבד, אין זיכוי נקודות |
| `"attributed"` | **מזכה את המזמין `points_per_referral` נקודות** |

> ⚠️ **אסור לשלוח `attributed` יותר מפעם אחת לאותו `new_user_id`.** השרת מגן על זה אוטומטית — אם `referred_by` כבר מלא, לא יינתן זיכוי כפול. אבל מומלץ לנהל את זה גם בצד ה-SDK.

---

### `GET /api/referral/balance?user_id=XYZ`

מחזיר את יתרת הנקודות של המשתמש.

**Response:**
```json
{
  "user_id":        "XYZ",
  "points_balance": 250,
  "cached":         true
}
```

- `cached: true` → מגיע מ-Redis (TTL 15 שניות), מהיר מאוד
- `cached: false` → מגיע ישירות מ-PostgreSQL
- בטוח לקרוא בכל טעינת מסך

---

### `POST /api/referral/claim`

מנכה נקודות כשמשתמש ממיר לפרס.

**Request:**
```json
{
  "user_id": "XYZ",
  "cost":    250
}
```

**Response (הצלחה):**
```json
{
  "status":         "ok",
  "user_id":        "XYZ",
  "points_balance": 0
}
```

**Response (אין מספיק נקודות → `402`):**
```json
{
  "error":   "Insufficient points",
  "balance": 100
}
```

> **מומלץ:** בדוק את היתרה עם `/balance` לפני שמציגים למשתמש את אפשרות ה-Claim, כדי למנוע את ה-`402`.

---

## 4. כלל הזהב — `user_id`

```
user_id = ה-ID הייחודי הפנימי שלך לכל משתמש
          (מ-Firebase Auth / מסד הנתונים שלך)
```

| ✅ נכון | ❌ לא נכון |
|---------|-----------|
| `"uid_firebase_abc123"` | `"john@example.com"` |
| `"user_8821"` | `"John Smith"` |
| מזהה קבוע שלא משתנה | מידע שיכול להשתנות |

- **אסור** ש-`user_id` ישתנה בין קריאות לאותו משתמש
- **אסור** שאותו `user_id` יהיה גם inviter וגם referee (השרת חוסם)
- **אל תשים** מידע רגיש (email, טלפון, שם) — הוא נשמר ב-DB ב-plain text

---

## 5. Anti-Fraud — Rate Limit

רק `/api/referral/track` מוגן. ניתן לשנות את ההגדרות דרך ה-Developer Portal.

| פרמטר | ברירת מחדל | שינוי |
|-------|-----------|-------|
| מקסימום בקשות | 5 | Portal → Campaign Manager |
| חלון זמן | 60 שניות | קבוע |
| מפתח | IP + project + endpoint | — |

**כשחורגים — `429 Too Many Requests`:**
```json
{
  "error":                "Rate limit exceeded. Slow down.",
  "retry_after_seconds":  42
}
```

> ⚠️ **ה-SDK חייב לטפל ב-429.** יש לחכות `retry_after_seconds` לפני ניסיון חוזר. חוסם אוטומטי נרשם ב-Anti-Fraud Logs בפורטל.

---

## 6. טבלת שגיאות מלאה

| קוד | משמעות | פתרון |
|-----|--------|-------|
| `400` | חסר שדה חובה בגוף הבקשה | בדוק `user_id` / `invite_code` / `cost` |
| `401` | חסרים headers | הוסף `x-api-key` + `x-project-id` |
| `402` | אין מספיק נקודות | הצג יתרה למשתמש לפני Claim |
| `403` | credentials לא תואמים | בדוק את הערכים אל מול הפורטל |
| `404` | `invite_code` לא קיים | לינק פג תוקף / שגוי |
| `429` | Rate limit חרג | המתן `retry_after_seconds` |
| `500` | שגיאת שרת | בדוק logs: `docker compose logs backend` |

---

## 7. Flow מלא — דיאגרמה

```
┌─────────────────────────────────────────────────────────────┐
│                        SDK FLOW                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  משתמש A (קיים)                                            │
│       │                                                     │
│       ▼                                                     │
│  POST /generate { user_id: A }                              │
│       │                                                     │
│       ▼                                                     │
│  ← { invite_code, deep_link }                               │
│       │                                                     │
│       │  A שולח deep_link לחבר B                           │
│       ▼                                                     │
│  B לוחץ → POST /track { stage:"click",       new_user_id:B }│
│  B מתקין → POST /track { stage:"install",    new_user_id:B }│
│  B נרשם  → POST /track { stage:"attributed", new_user_id:B }│
│                    │                                        │
│                    ▼                                        │
│             A ← +100 נקודות ✅                              │
│                                                             │
│  A רוצה פרס:                                               │
│  GET  /balance?user_id=A   → { points_balance: 100 }       │
│  POST /claim { user_id:A, cost:100 } → { balance: 0 }      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. הרצה מקומית מהירה

```powershell
# Backend (PostgreSQL + Redis + Flask) — מריץ הכל ב-Docker
cd server_SDK
docker compose up -d

# Developer Portal — React
cd portal
npm run dev
# → http://localhost:5173
```

### בדיקת חיבור

```powershell
# בדיקת health
Invoke-RestMethod http://localhost:5000/health
# ← { status: "ok" }

# יצירת referral link
Invoke-RestMethod -Method POST http://localhost:5000/api/referral/generate `
  -Headers @{"x-api-key"="demo_api_key_local_dev";"x-project-id"="proj_demo_local"} `
  -Body '{"user_id":"test_user_1"}' -ContentType "application/json"
```
