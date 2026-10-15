# DavomatOne: ko‘p yillik sinf hayot sikli, arxiv va o‘quv taqvimi dizayni

## Maqsad

DavomatOne bir o‘quv yiliga emas, ko‘p yillik maktab ishiga mos ishlashi kerak. Sinflar yil sayin keyingi bosqichga o‘tadi, 11-sinflar bitirganda tarix yo‘qolmasdan arxivlanadi, yangi 5-sinflar yangi oqim sifatida qo‘shiladi. Davomat, statistika va bildirishnomalar esa faqat haqiqiy o‘qish kunlari bo‘yicha ishlaydi.

Bu dizayn mavjud Google Apps Script + Google Sheets + Telegram Bot arxitekturasini saqlaydi. Hozirgi `CLASSES`, `STUDENTS`, `USERS`, `ATTENDANCE`, `SETTINGS` jadvallari bilan moslik saqlanadi va yangi jadvallar/maydonlar migratsiya orqali qo‘shiladi.

## Qabul qilingan asosiy qarorlar

1. `class_id` sinf oqimining barqaror identifikatori bo‘lib qoladi. Masalan, bir oqimning nomi `5-01 -> 6-01 -> ... -> 11-01` o‘zgarsa ham `class_id` o‘zgarmaydi.
2. Admin har o‘quv yili uchun aniq `promotion_date` belgilaydi. Avtomatik bosqichga o‘tish aynan shu sana bo‘yicha ishlaydi.
3. `11-*` sinflar promotion vaqtida bitirgan hisoblanadi va arxivlanadi. Ularning o‘quvchilari o‘chirilmaydi.
4. Sinf rahbari 5–10-sinf oralig‘ida o‘sha sinf oqimi bilan keyingi bosqichga birga o‘tadi. 11-sinf bitirganda rahbar sinfdan bo‘shatiladi va keyin yangi bo‘sh sinfni tanlashi mumkin.
5. Yangi 5-sinflar eski bitirgan `class_id`ni qayta ishlatmaydi; ular yangi `class_id` bilan yaratiladi.
6. Standart o‘qish kunlari dushanba–juma. Shanba va yakshanba standart dam olish kunlari.
7. Admin ta’til, bayram/dam olish va istisno ish kunlarini Telegram ichidan boshqaradi.
8. Statistika va davomat eslatmalari ta’til/dam olish kunlarini “davomat berilmadi” deb hisoblamaydi.
9. Avtomatik promotion idempotent bo‘ladi: trigger qayta ishlasa ham bir sinf ikki pog‘ona o‘sib ketmaydi.

## Mavjud tizim bilan bog‘lanish

Hozirgi `Code.gs` quyidagi asosiy jadvallarga tayanadi:

- `CLASSES`: `class_id`, `class_name`, `teacher_telegram_id`, `active`
- `STUDENTS`: `student_id`, `full_name`, `class_id`, `active`
- `USERS`: `telegram_id`, `full_name`, `role`, `class_id`, `active`
- `ATTENDANCE`: `date`, `class_id`, `student_id`, `status`, `updated_by`, `updated_at`
- `SETTINGS`: shaxsiy bildirishnoma sozlamalari

Yangi dizayn shu ustunlarni buzmaydi. Qo‘shimcha ustunlar va jadvallar schema migratsiyasi orqali qo‘shiladi. `ensureSchema_()` endi faqat aniq header tengligini tekshirish o‘rniga mavjud ustunlarni saqlab, yetishmayotgan yangi ustunlarni oxiriga qo‘sha olishi kerak.

## Ma’lumotlar modeli

### `ACADEMIC_YEARS`

Yangi jadval:

`year_id | title | start_date | end_date | promotion_date | status | promoted_at | activated_at`

Misol:

`2026-2027 | 2026/2027 | 2026-09-02 | 2027-05-25 | 2027-06-01 | ACTIVE | | 2026-09-02T00:00:00`

`status` qiymatlari:

- `PLANNED` — keyingi o‘quv yili oldindan tayyorlangan;
- `ACTIVE` — hozirgi o‘quv yili;
- `ARCHIVED` — yakunlangan o‘quv yili.

Bir vaqtning o‘zida ko‘pi bilan bitta `ACTIVE` yil bo‘ladi. Promotion sanasidan oldin keyingi yil `PLANNED` bo‘lishi mumkin. Yozgi davrda hech bir yil `ACTIVE` bo‘lmasligi mumkin; bu paytda davomat va eslatmalar ishlamaydi.

### `CLASS_HISTORY`

Tarixiy sinf nomini saqlash uchun yangi jadval:

`class_id | academic_year_id | class_name | grade | section | teacher_telegram_id | active_from | active_to | status`

Har o‘quv yili boshida har faol sinf uchun bitta snapshot yozuvi yaratiladi. Shu sabab `class_id=3` bugun `6-01`, keyingi yil `7-01` bo‘lsa ham 2026/2027 statistikasi tarixiy `6-01` nomi bilan ko‘rinadi.

`status` qiymatlari:

- `ACTIVE`
- `PROMOTED`
- `GRADUATED`

### `CALENDAR`

Yangi jadval:

`event_id | start_date | end_date | type | title | active | created_by | created_at`

`type` qiymatlari:

- `VACATION` — ta’til;
- `HOLIDAY` — bayram yoki qo‘shimcha dam olish kuni;
- `WORKDAY` — shanba/yakshanba yoki boshqa yopiq sanani istisno tariqasida o‘qish kuni qilish.

Taqvim qarori quyidagi ustuvorlikda olinadi:

1. `WORKDAY` — o‘qish kuni;
2. `VACATION` yoki `HOLIDAY` — o‘qish kuni emas;
3. kalendar yozuvi bo‘lmasa, dushanba–juma — o‘qish kuni, shanba/yakshanba — dam olish.

Bir sana oralig‘ida qarama-qarshi eventlar bo‘lsa `WORKDAY` yuqori ustuvorlikka ega. Admin UI eventlarni ko‘rsatadi va kerak bo‘lsa o‘chirishi mumkin.

### `CLASSES` kengaytmasi

Mavjud ustunlarga quyidagilar qo‘shiladi:

`archived_year_id | archived_at`

Faol 5–10-sinf promotion qilinganda `class_name` yangilanadi va `active=true` qoladi. 11-sinf bitirganda `active=false`, `archived_year_id=<joriy yil>`, `archived_at=<vaqt>` bo‘ladi.

### `STUDENTS` kengaytmasi

Mavjud ustunlarga quyidagilar qo‘shiladi:

`graduated_year_id | graduated_at`

11-sinf bitirganda shu sinfdagi faol o‘quvchilar:

- `active=false`;
- `graduated_year_id=<joriy yil>`;
- `graduated_at=<vaqt>`.

Ular `STUDENTS`dan o‘chirilmaydi. Shuning uchun student ID va barcha eski `ATTENDANCE` yozuvlari tarixda saqlanadi.

### `ATTENDANCE` kengaytmasi

Mavjud ustunlarga:

`academic_year_id`

qo‘shiladi.

Yangi davomat saqlanganda joriy faol o‘quv yili IDsi yoziladi. Eski mavjud davomat yozuvlari migratsiya vaqtida sanaga mos o‘quv yiliga bog‘lanadi. Hozirgi loyiha yangi ishga tushgan bo‘lsa, mavjud yozuvlar joriy yilga bog‘lanadi.

## Sinf nomini oshirish qoidasi

Faol sinf nomi `GRADE-SECTION` ko‘rinishida bo‘lishi kerak. Masalan:

- `5-01`
- `6-02`
- `10-03`

Promotion algoritmi sinf nomidan faqat birinchi raqamli qismni grade sifatida oladi va suffixni aynan saqlaydi:

- `5-01 -> 6-01`
- `7-03 -> 8-03`
- `10-02 -> 11-02`

Grade `11` bo‘lsa yangi nom yaratilmaydi; sinf arxivlanadi.

Sinf nomi bu formatga mos kelmasa avtomatik promotion uni o‘zgartirmaydi va admin hisobotiga “nomi tekshirilishi kerak” sifatida kiritadi. Noto‘g‘ri sinf sabab boshqa sinflarning promotion jarayoni to‘xtab qolmaydi.

## O‘quv yili boshqaruvi

SUPER ADMIN va ADMIN menyusida `O‘quv yili` bo‘limi bo‘ladi.

Asosiy amallar:

- `Joriy yil` — faol yil ma’lumotlari;
- `Yangi yil tayyorlash` — `title`, `start_date`, `end_date`, `promotion_date` kiritish;
- `Promotion sanasi` — hali promotion bo‘lmagan yil sanasini tahrirlash;
- `Sinflar holati` — qaysi sinf qaysi bosqichda va qaysi rahbar bilan ekanini ko‘rsatish;
- `Arxiv` — yakunlangan o‘quv yillari va bitirgan sinflarni ko‘rish.

Sanalar `YYYY-MM-DD` formatida saqlanadi va Asia/Tashkent timezone bo‘yicha talqin qilinadi.

## Promotion jarayoni

`processAcademicYearMaintenance_()` kuniga bir marta time-based trigger orqali ishlaydi.

Promotion sanasi kelganda:

1. `LockService` orqali global script lock olinadi.
2. Joriy yil topiladi.
3. `promoted_at` allaqachon to‘ldirilgan bo‘lsa jarayon darhol tugaydi.
4. Barcha faol sinflar o‘qiladi.
5. Har sinf uchun joriy yil `CLASS_HISTORY` snapshoti `PROMOTED` yoki `GRADUATED` holatiga yopiladi.
6. 5–10-sinflarning grade qismi +1 qilinadi; `class_id`, teacher va student bog‘lanishlari o‘zgarmaydi.
7. 11-sinflar `CLASSES.active=false` qilinadi; ularning faol o‘quvchilari bitirgan sifatida belgilanadi.
8. Bitirgan sinfning `teacher_telegram_id` qiymati tozalanadi. Shu teacherning `USERS.class_id` qiymati tozalanadi va teacher foydalanuvchisi sinf tanlashga qaytariladi.
9. Joriy yil `ARCHIVED` qilinadi va `promoted_at` yoziladi.
10. Keyingi `PLANNED` yil mavjud bo‘lsa u o‘z `start_date` sanasida `ACTIVE` bo‘ladi. Promotion kuni bilan start kuni bir xil bo‘lishi shart emas.
11. Jarayon natijasi log va admin xabari sifatida qayd etiladi: nechta sinf ko‘tarildi, nechta sinf bitirdi, nechta o‘quvchi arxivlandi, qaysi sinflarda nom xatosi bor.
12. Lock bo‘shatiladi.

Bu jarayon transaction bo‘lmagan Google Sheets muhitida qayta ishlashga chidamli bo‘lishi uchun har sinf bo‘yicha holat tekshiruvi va yilning `promoted_at` flagidan foydalanadi.

## Yangi 5-sinflar

Bitirgan sinfning `class_id`si qayta ishlatilmaydi.

Admin yangi 5-sinf yaratganda `addClass_()` yangi raqamli `class_id` beradi. Yangi sinf joriy yoki rejalashtirilgan o‘quv yiliga bog‘lanadi va o‘quv yili faollashganda `CLASS_HISTORY` snapshoti yaratiladi.

Bu yondashuv eski bitiruvchi oqim tarixi bilan yangi 5-sinf tarixining aralashib ketishini oldini oladi.

## Taqvim boshqaruvi

Admin menyusida `Taqvim` bo‘limi bo‘ladi.

Amallar:

- `Ta’til qo‘shish`
- `Dam olish/Bayram qo‘shish`
- `Ish kuni qo‘shish`
- `Taqvimni ko‘rish`
- mavjud eventni `O‘chirish`

Event qo‘shishda admin:

1. boshlanish sanasi;
2. tugash sanasi;
3. nomi

ni kiritadi.

Bir kunlik eventda start va end bir xil bo‘ladi. Sana oralig‘i teskari bo‘lsa yoki format noto‘g‘ri bo‘lsa saqlanmaydi.

## `isSchoolDay_()` yagona qaror nuqtasi

Davomat, statistika va bildirishnoma turli joylarda alohida hafta kuni tekshirmaydi. Buning o‘rniga bitta:

`isSchoolDay_(dateKey)`

funksiyasi bo‘ladi.

U:

1. sanaga tegishli o‘quv yilini topadi;
2. sana o‘quv yilining `start_date..end_date` oralig‘ida ekanini tekshiradi;
3. `CALENDAR` override’larini tekshiradi;
4. override bo‘lmasa dushanba–juma qoidasi bilan qaror beradi.

Shu bitta funksiya barcha funksional qismlar uchun source of truth bo‘ladi.

## Davomatga ta’siri

- O‘qish kuni bo‘lmasa teacher `Bugungi davomat`ni ochganda “Bugun o‘qish kuni emas” xabari chiqadi.
- Admin tarixiy sanaga davomatni ko‘rishi mumkin, lekin yangi davomat yozish faqat o‘qish kuniga ruxsat etiladi.
- Kerak bo‘lsa admin `WORKDAY` event yaratib shanba/yakshanbani o‘qish kuniga aylantira oladi.
- Mavjud tez davomat mexanizmi (`Keldi` default, faqat kelmaganlarni bosish) saqlanadi.

## Statistikaga ta’siri

Hozirgi muddatli statistika “faol kunlar”ni faqat `ATTENDANCE`da yozuv mavjud sanalardan chiqarib olmasligi kerak. Yangi model intervaldagi barcha haqiqiy o‘qish kunlarini `isSchoolDay_()` bilan generatsiya qiladi.

Shuning uchun:

- hech bir sinf davomat bermagan kun ham statistikada haqiqiy “davomat bermagan kun” sifatida ko‘rinadi;
- shanba/yakshanba avtomatik hisobdan chiqadi;
- `VACATION` va `HOLIDAY` kunlari hisobdan chiqadi;
- `WORKDAY` kunlari hisobga kiradi;
- tarixiy intervalda sinf nomi `CLASS_HISTORY`dan olinadi, hozirgi `CLASSES.class_name`dan emas;
- bitirgan sinflar eski davr statistikasida ko‘rinishda davom etadi.

## Bildirishnomaga ta’siri

`processNotifications_()` avval `isSchoolDay_(today)`ni tekshiradi.

Agar bugun o‘qish kuni bo‘lmasa:

- teacherga eslatma yuborilmaydi;
- ADMIN/SUPER ADMINga “davomat bermagan sinflar” xabari yuborilmaydi;
- foydalanuvchining `last_notification_date` qiymati bekorga yangilanmaydi.

Agar o‘qish kuni bo‘lsa, mavjud shaxsiy vaqt sozlamalari o‘zgarishsiz ishlaydi.

## Arxiv ko‘rinishi

Admin `O‘quv yili -> Arxiv` orqali:

- o‘quv yilini;
- o‘sha yildagi sinflarni;
- tarixiy sinf nomi va rahbarini;
- bitirgan sinflarni;
- bitirgan o‘quvchilarni;
- davomat statistikalarini

ko‘ra oladi.

Arxiv faqat o‘qish uchun. Eski yil ma’lumotlarini oddiy bot amallari bilan o‘zgartirib bo‘lmaydi.

## Migratsiya

Yangilanish bir martalik destructive reset qilmaydi.

Schema migratsiyasi:

1. `ACADEMIC_YEARS`, `CLASS_HISTORY`, `CALENDAR` jadvallarini yaratadi.
2. `CLASSES`, `STUDENTS`, `ATTENDANCE`ga yetishmayotgan yangi ustunlarni oxiriga qo‘shadi.
3. Hozirgi faol sinflar uchun boshlang‘ich `CLASS_HISTORY` snapshotlarini yaratadi.
4. Mavjud attendance yozuvlarini joriy akademik yil bilan bog‘laydi.
5. `class_id`, `student_id`, Telegram user ID va mavjud attendance satrlarini o‘zgartirmaydi.

Migratsiya qayta ishga tushirilsa duplicate history yoki duplicate calendar yozuvlari hosil qilmasligi kerak.

Birinchi o‘quv yilini yaratish uchun SUPER ADMINga setup flow beriladi. Mavjud sinflar shu yilning joriy sinflari sifatida snapshot qilinadi.

## Triggerlar

Ikki xil trigger alohida vazifaga ega bo‘ladi:

1. `processNotifications_()` — mavjud 5 daqiqalik trigger; faqat bildirishnoma vaqtini tekshiradi.
2. `processAcademicYearMaintenance_()` — kuniga bir marta ishlaydi; yilni faollashtirish, promotion va arxivni bajaradi.

`installDavomatTriggers()` ikkalasini idempotent tarzda yaratadi. Mavjud trigger bo‘lsa ikkinchisini yaratmaydi.

## Xatoliklar va xavfsizlik

- Promotion `LockService` bilan himoyalanadi.
- `promoted_at` ikkinchi promotionni bloklaydi.
- Invalid class nomi boshqa sinflarning promotionini to‘xtatmaydi.
- `class_id` promotion paytida o‘zgarmaydi.
- 11-sinf bitirganda attendance/history o‘chirilmaydi.
- Taqvim eventini o‘chirish tarixiy attendance satrlarini o‘zgartirmaydi; faqat keyingi hisob-kitobdagi school-day talqiniga ta’sir qiladi.
- Arxivlangan yil ma’lumotlari normal admin edit amallaridan himoyalanadi.
- Barcha sana hisoblari `Asia/Tashkent` timezone’da bajariladi.

## Test strategiyasi

Implementatsiya TDD bilan qilinadi. Kamida quyidagilar regression testlarda tekshiriladi:

1. `5-01 -> 6-01`, `10-03 -> 11-03` promotion.
2. `11-01` sinf arxivlanishi va o‘quvchilarning graduated bo‘lishi.
3. Promotion ikki marta chaqirilganda ikkinchi chaqiriq hech narsani qayta o‘zgartirmasligi.
4. Teacher 5–10 oralig‘ida class bilan qolishi, 11-sinf bitirganda bo‘shatilishi.
5. Yangi 5-sinf yangi `class_id` olishi.
6. Dushanba–juma default school day.
7. Shanba/yakshanba default non-school day.
8. `VACATION`/`HOLIDAY` weekdayni non-school day qilishi.
9. `WORKDAY` weekendni school day qilishi.
10. Statistikadagi school-day count attendance mavjudligiga emas, calendar qoidalariga bog‘liq bo‘lishi.
11. Hech kim davomat bermagan haqiqiy o‘qish kuni “missing” sifatida sanalishi.
12. Ta’til kuni notification yuborilmasligi.
13. History eski class nomi bilan ko‘rinishi.
14. Schema migration existing data va IDlarni saqlashi.
15. Invalid sinf nomi skip qilinib admin reportga tushishi.

## Qabul mezonlari

Feature tayyor hisoblanadi, agar:

- admin o‘quv yilini va promotion sanasini Telegram’dan boshqara olsa;
- promotion sanasida 5–10 sinflar avtomatik keyingi grade’ga o‘tsa;
- 11-sinflar va o‘quvchilar o‘chmasdan arxivlansa;
- yangi 5-sinf yangi ID bilan qo‘shilsa;
- tarixiy statistika eski sinf nomlarini to‘g‘ri ko‘rsatsa;
- standart o‘qish haftasi dushanba–juma bo‘lsa;
- admin ta’til, bayram/dam olish va istisno ish kunlarini belgilay olsa;
- statistika faqat haqiqiy o‘qish kunlarini hisoblasa;
- notificationlar faqat haqiqiy o‘qish kunlarida ishlasa;
- barcha yangi trigger va migratsiyalar qayta ishga tushirilganda xavfsiz bo‘lsa;
- mavjud davomat, student ID va class ID tarixlari saqlansa.

## Scope’dan tashqari

Ushbu bosqichda quyidagilar kiritilmaydi:

- bir o‘quvchini yil o‘rtasida boshqa sinfga ko‘chirish tarixi;
- parallel maktab/filiallar;
- fan/dars soati kesimidagi davomat;
- ota-onalarga alohida bildirishnoma;
- avtomatik davlat bayramlari API integratsiyasi.

Bu imkoniyatlar keyinchalik mavjud `academic_year_id`, `CLASS_HISTORY` va `CALENDAR` arxitekturasi ustiga qo‘shilishi mumkin.