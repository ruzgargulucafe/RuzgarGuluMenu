
import { db } from "./app.js";

import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =========================
// YARDIMCI FONKSİYONLAR
// =========================

function urunAdi(i) {
  return i.name || i.productName || i.title || i.product?.name || "Ürün";
}

function urunAdedi(i) {
  return Number(i.qty ?? i.quantity ?? 1);
}

function urunListesi(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "<i>Sipariş ürünleri bulunamadı.</i><br>";
  }

  return items.map(i => {
    const ad = urunAdi(i);
    const adet = urunAdedi(i);
    const fiyat = Number(i.price ?? i.product?.price ?? 0);

    return `
      <div style="padding:5px 0;border-bottom:1px solid #444">
        <b>${ad}</b>
        <span> × ${adet}</span>
        ${fiyat > 0
          ? `<br><small>Birim: ${fiyat}₺ · Ara toplam: ${fiyat * adet}₺</small>`
          : ""}
      </div>
    `;
  }).join("");
}

function siparisDurumu(o) {
  return String(o.status || "Bekliyor").trim().toLocaleLowerCase("tr-TR");
}

function guvenliMetin(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

// =========================
// SİPARİŞLER + MASALAR
// =========================

onSnapshot(collection(db, "orders"), snap => {
  let yeniHTML = "";
  let hazirHTML = "";
  const masalar = {};

  snap.forEach(d => {
    const o = d.data();
    if (!o || o.closed) return;

    const masa = o.table || "Masa belirtilmemiş";
    const toplam = Number(o.total || 0);

    if (!masalar[masa]) masalar[masa] = 0;
    masalar[masa] += toplam;

    const durum = siparisDurumu(o);
    const urunler = urunListesi(o.items);
    const masaGoster = guvenliMetin(masa);
    const siparisToplami = `${toplam}₺`;

    // Yeni siparişler
    if (["bekliyor", "yeni", "yeni sipariş", "new"].includes(durum)) {
      yeniHTML += `
        <div class="card">
          <h3>🆕 ${masaGoster}</h3>
          ${urunler}
          <p><b>Sipariş toplamı: ${siparisToplami}</b></p>
          <button class="green" onclick="hazir('${d.id}')">
            🍳 Hazırlamaya Al / Hazır
          </button>
        </div>
      `;
    }

    // Hazırlanan / hazır siparişler
    if (["hazırlanıyor", "hazirlaniyor", "hazır", "hazir", "preparing", "ready"].includes(durum)) {
      hazirHTML += `
        <div class="card">
          <h3>🍳 ${masaGoster}</h3>
          ${urunler}
          <p><b>Sipariş toplamı: ${siparisToplami}</b></p>
          <button class="orange" onclick="teslimEdildi('${d.id}')">
            ✔ Teslim Edildi
          </button>
        </div>
      `;
    }

    // "Teslim Edildi" siparişler burada gösterilmez.
    // Ancak kapatılmadığı sürece masa hesabına dahil edilir.
  });

  document.getElementById("yeni").innerHTML =
    yeniHTML || "Yeni sipariş yok";

  document.getElementById("hazir").innerHTML =
    hazirHTML || "Hazırlanan sipariş yok";

  let masaHTML = "";

  for (const masa in masalar) {
    masaHTML += `
      <div class="card">
        <b>${guvenliMetin(masa)}</b><br>
        Toplam: ${masalar[masa]}₺
      </div>
    `;
  }

  document.getElementById("masalar").innerHTML = masaHTML || "Açık masa yok";
}, error => {
  console.error("Siparişler okunamadı:", error);
  document.getElementById("yeni").textContent = "Siparişler yüklenemedi.";
});

// =========================
// HAZIR BUTONU
// =========================

window.hazir = async id => {
  try {
    await updateDoc(doc(db, "orders", id), {
      status: "Hazır"
    });
  } catch (error) {
    console.error(error);
    alert("Sipariş güncellenemedi.");
  }
};

// =========================
// TESLİM EDİLDİ
// =========================

window.teslimEdildi = async id => {
  if (!confirm("Bu sipariş müşteriye teslim edildi mi?")) return;

  try {
    await updateDoc(doc(db, "orders", id), {
      status: "Teslim Edildi",
      deliveredAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    alert("Sipariş teslim durumu kaydedilemedi.");
  }
};

// =========================
// GARSON ÇAĞRILARI
// =========================

onSnapshot(collection(db, "calls"), snap => {
  let html = "";

  snap.forEach(d => {
    const c = d.data();
    const tarih = c.createdAt?.toDate?.().toLocaleString("tr-TR") || "";

    html += `
      <div class="card">
        Masa: ${guvenliMetin(c.table)}<br>
        <small>${tarih}</small><br>
        <button class="red" onclick="silCall('${d.id}')">Temizle</button>
      </div>
    `;
  });

  document.getElementById("calls").innerHTML = html || "Yok";
});

window.silCall = async id => {
  try {
    await deleteDoc(doc(db, "calls", id));
  } catch (error) {
    console.error(error);
    alert("Garson çağrısı silinemedi.");
  }
};



 // =========================
 // HESAP İSTEKLERİ + QR ÖDEME TALEPLERİ
 // =========================

let billRequestsData = [];
let paymentRequestsData = [];
let masaKapatmaIslemleri = new Set();
let qrOnayIslemleri = new Set();

// =========================
// HESAP VE QR TALEPLERİNİ GÖSTER
// =========================

function hesapVeOdemeGoster() {
  const alan = document.getElementById("bills");
  if (!alan) return;

  let html = "";

  // Normal hesap istekleri
  if (billRequestsData.length) {
    html += `<h3>🧾 Hesap İstekleri</h3>`;

    billRequestsData.forEach(b => {
      const masa = guvenliMetin(b.table);
      const id = guvenliMetin(b.id);

      html += `
        <div class="card">
          <b>Masa: ${masa}</b><br>
          <small>${guvenliMetin(b.tarih || "")}</small><br>
          <p>Masadaki tüm hesabın tahsil edilmesi isteniyor.</p>

          <button class="orange"
            onclick="odemeAl('${masa}','${id}','Nakit')">
            💵 Nakit al
          </button>

          <button class="green"
            onclick="odemeAl('${masa}','${id}','Kart')">
            💳 Kart al
          </button>
        </div>`;
    });
  }

  // QR ödeme talepleri
  if (paymentRequestsData.length) {
    html += `<h3>💸 QR Ödeme Talepleri</h3>`;

    paymentRequestsData.forEach(p => {
      const id = guvenliMetin(p.id);
      const masa = guvenliMetin(p.table);

      html += `
        <div class="card">
          <b>Masa: ${masa}</b><br>
          Müşteri: ${guvenliMetin(p.personName || "Belirtilmemiş")}<br>

          Tutar:
          <b>${Number(p.amount || 0).toLocaleString("tr-TR")} ₺</b><br>

          Tür:
          ${guvenliMetin(
            p.scope === "shared"
              ? "Ortak hesaba katkı"
              : "Kendi hesabı"
          )}<br>

          İstenen yöntem:
          ${guvenliMetin(p.method || "Belirtilmemiş")}<br>

          <small>${guvenliMetin(p.tarih || "")}</small><br>
          <span style="color:#ff9800">
            ⏳ Ödeme onayı bekleniyor
          </span><br>

          <button class="green"
            onclick="qrOdemeyiOnayla('${id}')">
            ✔ Tahsilatı Onayla
          </button>

          <button class="red"
            onclick="qrOdemeyiReddet('${id}')">
            ✖ Reddet
          </button>
        </div>`;
    });
  }

  alan.innerHTML =
    html || "Bekleyen hesap veya ödeme isteği yok.";
}

// =========================
// MASANIN BORCUNU KONTROL ET
// TAM ÖDENDİYSE SİPARİŞLERİ KAPAT
// =========================

async function masayiKontrolEtVeKapat(masa, orderIds = []) {
  const masaAnahtari = String(masa);
  const hedefIds = [...new Set(orderIds.map(String))];

  if (hedefIds.length === 0) {
    console.warn("Ödeme talebinde sipariş kimlikleri yok. Masa kapatılmadı.");
    return;
  }

  const islemAnahtari =
    `${masaAnahtari}:${[...hedefIds].sort().join(",")}`;

  if (masaKapatmaIslemleri.has(islemAnahtari)) return;
  masaKapatmaIslemleri.add(islemAnahtari);

  try {
    const [siparisSnap, odemeSnap] = await Promise.all([
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "payments"))
    ]);

    const hedefSiparisler = siparisSnap.docs.filter(d => {
      const s = d.data();

      return hedefIds.includes(d.id)
        && String(s.table) === masaAnahtari
        && s.closed !== true
        && String(s.status || "").toLowerCase() !== "cancelled";
    });

    if (hedefSiparisler.length !== hedefIds.length) {
      console.warn(
        "Siparişlerin bir kısmı bulunamadı veya zaten kapalı. " +
        "Otomatik kapatma yapılmadı."
      );
      return;
    }

    const masaToplami = hedefSiparisler.reduce(
      (sum, d) => sum + Number(d.data().total || 0),
      0
    );

    if (!Number.isFinite(masaToplami) || masaToplami <= 0) {
      console.warn("Hesap toplamı geçersiz. Masa kapatılmadı.");
      return;
    }

    const hedefKey = [...hedefIds].sort().join("|");

    const onayliOdemeler = odemeSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => {
        if (
          String(p.table) !== masaAnahtari ||
          p.status !== "confirmed" ||
          !Array.isArray(p.orderIds)
        ) {
          return false;
        }

        return [...new Set(p.orderIds.map(String))]
          .sort()
          .join("|") === hedefKey;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    if (onayliOdemeler < masaToplami) {
      console.log(
        `Masa ${masaAnahtari}: ${masaToplami} ₺ hesap, ` +
        `${onayliOdemeler} ₺ ödeme. Masa açık kalıyor.`
      );
      return;
    }

    if (onayliOdemeler > masaToplami) {
      console.warn(
        "Ödemeler hesap toplamını aşıyor. Masa kapatılmadı."
      );
      return;
    }

    for (const d of hedefSiparisler) {
      await updateDoc(doc(db, "orders", d.id), {
        closed: true,
        paymentType: "QR",
        paidAt: serverTimestamp()
      });
    }

    console.log(`Masa ${masaAnahtari} hesabı kapatıldı.`);
  } catch (error) {
    console.error("Masa hesabı kontrol edilemedi:", error);
    throw error;
  } finally {
    masaKapatmaIslemleri.delete(islemAnahtari);
  }
}


// =========================
// NORMAL HESAP İSTEKLERİNİ DİNLE
// =========================

onSnapshot(
  collection(db, "billRequests"),
  snap => {
    billRequestsData = snap.docs
      .filter(d => d.data().status !== "Tamamlandı")
      .map(d => {
        const b = d.data();

        return {
          id: d.id,
          ...b,
          tarih: b.createdAt?.toDate?.().toLocaleString("tr-TR") || ""
        };
      });

    hesapVeOdemeGoster();
  },
  error => {
    console.error("Hesap istekleri okunamadı:", error);
  }
);

// =========================
// QR ÖDEME TALEPLERİNİ DİNLE
// =========================

onSnapshot(
  collection(db, "paymentRequests"),
  snap => {
    paymentRequestsData = snap.docs
      .filter(d => {
        const durum = String(d.data().status || "").toLowerCase();

        return !["confirmed", "rejected"].includes(durum);
      })
      .map(d => {
        const p = d.data();

        return {
          id: d.id,
          ...p,
          tarih: p.createdAt?.toDate?.().toLocaleString("tr-TR") || ""
        };
      });

    hesapVeOdemeGoster();
  },
  error => {
    console.error("QR ödeme talepleri okunamadı:", error);

    const alan = document.getElementById("bills");
    if (alan) {
      alan.textContent =
        "QR ödeme talepleri yüklenemedi. Firebase kurallarını kontrol edin.";
    }
  }
);

// =========================
// QR TAHSİLATINI ONAYLA
// =========================

window.qrOdemeyiOnayla = async function(id) {
  const talep = paymentRequestsData.find(p => p.id === id);

if (!talep) {
  alert("Ödeme talebi bulunamadı veya artık beklemiyor.");
  return;
}

if (talep.status !== "pending") {
  alert("Bu ödeme talebi zaten işlenmiş veya beklemede değil.");
  return;
}
if (qrOnayIslemleri.has(id)) {
  alert("Bu ödeme talebi için işlem zaten devam ediyor.");
  return;
}

qrOnayIslemleri.add(id);
  const tutar = Number(talep.amount || 0);

  if (!Number.isFinite(tutar) || tutar <= 0) {
    alert("Ödeme tutarı geçersiz.");
    return;
  }

  const varsayilanYontem =
    String(talep.method || "").toLocaleLowerCase("tr-TR") === "nakit"
      ? "Nakit"
      : "Kart";

  const secim = prompt(
    "Tahsilatı gerçekten aldıysanız ödeme yöntemini yazın:\nNakit veya Kart",
    varsayilanYontem
  );

  if (secim === null) return;

  const yontem = secim.trim().toLocaleLowerCase("tr-TR");
  let paymentType;

  if (yontem === "nakit") {
    paymentType = "Nakit";
  } else if (yontem === "kart" || yontem === "pos") {
    paymentType = "Kart";
  } else {
    alert("Yalnızca Nakit veya Kart yazabilirsiniz.");
    return;
  }

  const onay = confirm(
    `${talep.table} için ${tutar.toLocaleString("tr-TR")} ₺ ` +
    `${paymentType} tahsilatını gerçekten aldınız mı?`
  );

  if (!onay) return;

  try {
    // Tahsilatı kaydet
    await addDoc(collection(db, "payments"), {
      table: talep.table,
      personId: talep.personId || null,
      personName: talep.personName || "",
      scope: talep.scope || "own",
      orderIds: Array.isArray(talep.orderIds)
  ? talep.orderIds
  : [],
      amount: tutar,
      paymentType,
      method: paymentType,
      status: "confirmed",
      paymentRequestId: id,
      paidAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    // Talebi onaylandı olarak işaretle
    await updateDoc(doc(db, "paymentRequests", id), {
      status: "confirmed",
      confirmedMethod: paymentType,
      confirmedAt: serverTimestamp()
    });

    alert("Tahsilat kaydedildi. Masa hesabı kontrol ediliyor.");

    // Ödeme sonrası masanın borcunu kontrol et
    try {
      await masayiKontrolEtVeKapat(
  talep.table,
  talep.orderIds || []
);
    } catch (kapatmaHatasi) {
      alert(
        "Tahsilat kaydedildi ancak masa kapatılamadı. " +
        "Personel panelini ve Firebase izinlerini kontrol edin."
      );
    }
  } catch (error) {
    console.error("QR tahsilat hatası:", error);

    alert(
      "İşlem sırasında hata oluştu: " +
      (error.message || String(error)) +
      "\nTahsilat kaydı oluşmuş olabilir. Tekrar onaylamadan önce kasayı kontrol edin."
    );
  } finally {
  qrOnayIslemleri.delete(id);
}
};

// =========================
// QR ÖDEME TALEBİNİ REDDET
// =========================

window.qrOdemeyiReddet = async function(id) {
  const talep = paymentRequestsData.find(p => p.id === id);

  if (!talep) {
    alert("Ödeme talebi bulunamadı veya artık beklemiyor.");
    return;
  }

  if (!confirm("Bu ödeme talebini reddetmek istiyor musunuz?")) {
    return;
  }

  try {
    await updateDoc(doc(db, "paymentRequests", id), {
      status: "rejected",
      rejectedAt: serverTimestamp()
    });

    alert("Ödeme talebi reddedildi.");
  } catch (error) {
    console.error("Ödeme talebi reddedilemedi:", error);
    alert("Talep reddedilemedi: " + (error.message || error));
  }
};


 // =========================
 // ÖDEME AL
 // =========================

window.odemeAl = async (masa, requestId, tip) => {
  // Ödeme yöntemini doğrula
  if (!["Nakit", "Kart"].includes(tip)) {
    alert("Geçersiz ödeme yöntemi.");
    return;
  }

  try {
    // Masanın açık siparişlerini bul
    const snap = await getDocs(collection(db, "orders"));

    const acikSiparisler = snap.docs.filter(d => {
      const o = d.data();

      return String(o.table) === String(masa)
        && o.closed !== true;
    });

    if (acikSiparisler.length === 0) {
      alert(
        "Bu masada açık sipariş bulunamadı. " +
        "Hesap isteği silinmedi; siparişleri kontrol edin."
      );
      return;
    }

    // Açık siparişlerin toplamını hesapla
    const toplam = acikSiparisler.reduce((sum, d) => {
      return sum + Number(d.data().total || 0);
    }, 0);

    if (!Number.isFinite(toplam) || toplam <= 0) {
      alert("Masa hesabı geçersiz. Sipariş tutarlarını kontrol edin.");
      return;
    }

    // Tahsilat onayı
    const onay = confirm(
      `Masa: ${masa}\n` +
      `Toplam hesap: ${toplam.toLocaleString("tr-TR")} ₺\n` +
      `Ödeme yöntemi: ${tip}\n\n` +
      `Bu tutarın tamamını gerçekten tahsil ettiniz mi?`
    );

    if (!onay) return;

    // Açık siparişleri kapat
    for (const d of acikSiparisler) {
      await updateDoc(doc(db, "orders", d.id), {
        closed: true,
        paymentType: tip,
        paidAt: serverTimestamp(),
        dayClosed: false
      });
    }

    // Hesap isteğini, siparişler kapatıldıktan sonra sil
    await deleteDoc(doc(db, "billRequests", requestId));

    alert(
      `Masa ${masa} hesabı kapatıldı.\n` +
      `Tahsilat: ${toplam.toLocaleString("tr-TR")} ₺\n` +
      `Yöntem: ${tip}`
    );

  } catch (error) {
    console.error("Ödeme alma hatası:", error);

    alert(
      "Ödeme işlemi tamamlanamadı.\n" +
      "Firebase bağlantısını ve izinlerini kontrol edin. " +
      "Tekrar denemeden önce siparişlerin durumunu kontrol edin."
    );
  }
};


 
 // =========================
 // GÜNLÜK KASA — SİPARİŞLER + QR ÖDEMELERİ
 // =========================

let kasaOrders = [];
let kasaPayments = [];
let gunSonuIsleniyor = false;

// Firestore Timestamp veya Date değerini tarihe çevir
function kasaTarihiAl(deger) {
  if (!deger) return null;

  if (typeof deger.toDate === "function") {
    return deger.toDate();
  }

  if (deger instanceof Date) {
    return deger;
  }

  return null;
}

// Aynı gün kontrolü
function ayniGun(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// Yerel tarih: YYYY-MM-DD
function kasaTarihMetni(tarih) {
  return (
    `${tarih.getFullYear()}-` +
    `${String(tarih.getMonth() + 1).padStart(2, "0")}-` +
    `${String(tarih.getDate()).padStart(2, "0")}`
  );
}

// Günlük kasaya dahil edilecek normal siparişleri hesapla
function normalSiparisOdemesi(o, today) {
  if (
    o.closed !== true ||
    !o.paymentType ||
    o.dayClosed === true
  ) {
    return false;
  }

  // QR ödemeleri payments koleksiyonundan sayılacak
  if (String(o.paymentType).toUpperCase() === "QR") {
    return false;
  }

  const tarih = kasaTarihiAl(o.paidAt);

  return Boolean(tarih && ayniGun(tarih, today));
}

// Günlük kasaya dahil edilecek QR ödemelerini hesapla
function qrOdemesiGecerli(p, today) {
  if (
    p.status !== "confirmed" ||
    p.dayClosed === true
  ) {
    return false;
  }

  const tarih =
    kasaTarihiAl(p.paidAt) ||
    kasaTarihiAl(p.createdAt);

  return Boolean(tarih && ayniGun(tarih, today));
}

// Ödeme yöntemini standartlaştır
function kasaYontemi(p) {
  const yontem = String(
    p.paymentType || p.method || ""
  ).trim().toLocaleLowerCase("tr-TR");

  if (yontem === "nakit") return "Nakit";

  if (
    yontem === "kart" ||
    yontem === "pos"
  ) {
    return "Kart";
  }

  return "Diğer";
}

// Siparişleri ve QR tahsilatlarını tek hesapta birleştir
function gunlukKasaHesapla(today = new Date()) {
  const sonuc = {
    total: 0,
    cash: 0,
    card: 0,
    other: 0,
    orderCount: 0,
    qrPaymentCount: 0
  };

  kasaOrders.forEach(o => {
    if (!normalSiparisOdemesi(o, today)) return;

    const tutar = Number(o.total || 0);

    if (!Number.isFinite(tutar) || tutar <= 0) return;

    sonuc.total += tutar;
    sonuc.orderCount++;

    const yontem = kasaYontemi(o);

    if (yontem === "Nakit") {
      sonuc.cash += tutar;
    } else if (yontem === "Kart") {
      sonuc.card += tutar;
    } else {
      sonuc.other += tutar;
    }
  });

  kasaPayments.forEach(p => {
    if (!qrOdemesiGecerli(p, today)) return;

    const tutar = Number(p.amount || 0);

    if (!Number.isFinite(tutar) || tutar <= 0) return;

    sonuc.total += tutar;
    sonuc.qrPaymentCount++;

    const yontem = kasaYontemi(p);

    if (yontem === "Nakit") {
      sonuc.cash += tutar;
    } else if (yontem === "Kart") {
      sonuc.card += tutar;
    } else {
      sonuc.other += tutar;
    }
  });

  return sonuc;
}

// =========================
// GÜNLÜK KASA EKRANI
// =========================

function gunlukKasayiGoster() {
  const alan = document.getElementById("kasa");
  if (!alan) return;

  const kasa = gunlukKasaHesapla(new Date());

  alan.innerHTML = `
    <div class="card">
      <h3>💰 Günlük Kasa</h3>

      <b>Toplam: ${kasa.total.toLocaleString("tr-TR")} ₺</b><br>

      💵 Nakit: ${kasa.cash.toLocaleString("tr-TR")} ₺<br>

      💳 Kart / POS: ${kasa.card.toLocaleString("tr-TR")} ₺<br>

      Diğer yöntemler: ${kasa.other.toLocaleString("tr-TR")} ₺<br>

      <small>
        Normal sipariş: ${kasa.orderCount} |
        QR tahsilatı: ${kasa.qrPaymentCount}
      </small>
    </div>
  `;
}

// =========================
// SİPARİŞLERİ DİNLE
// =========================

onSnapshot(
  collection(db, "orders"),
  snap => {
    kasaOrders = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    gunlukKasayiGoster();
  },
  error => {
    console.error("Sipariş kasası okunamadı:", error);

    const alan = document.getElementById("kasa");
    if (alan) {
      alan.textContent = "Sipariş kasası yüklenemedi.";
    }
  }
);

// =========================
// QR ÖDEMELERİNİ DİNLE
// =========================

onSnapshot(
  collection(db, "payments"),
  snap => {
    kasaPayments = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    gunlukKasayiGoster();
  },
  error => {
    console.error("QR ödeme kasası okunamadı:", error);

    const alan = document.getElementById("kasa");
    if (alan) {
      alan.textContent = "QR ödeme kasası yüklenemedi.";
    }
  }
);

// =========================
// GÜN SONU KAPAT
// =========================

window.gunSonuKapat = async () => {
  if (gunSonuIsleniyor) {
    alert("Gün sonu işlemi zaten devam ediyor.");
    return;
  }

  const onay = confirm(
    "Gün sonu alınsın mı?\n\n" +
    "Bugünün tahsilatları raporlanacak. " +
    "Açık masalar kapatılmayacak."
  );

  if (!onay) return;

  gunSonuIsleniyor = true;

  try {
    const now = new Date();
    const todayStr = kasaTarihMetni(now);

    // En güncel kayıtları Firestore'dan oku
    const [ordersSnap, paymentsSnap] = await Promise.all([
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "payments"))
    ]);

    const orders = ordersSnap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    const payments = paymentsSnap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // Bugünün henüz gün sonuna alınmamış normal siparişleri
    const normalSiparisler = orders.filter(o => {
      return normalSiparisOdemesi(o, now);
    });

    // Bugünün henüz gün sonuna alınmamış QR tahsilatları
    const qrOdemeler = payments.filter(p => {
      return qrOdemesiGecerli(p, now);
    });

    // Normal sipariş toplamları
    let toplam = 0;
    let nakit = 0;
    let kart = 0;
    let diger = 0;

    for (const o of normalSiparisler) {
      const tutar = Number(o.total || 0);

      if (!Number.isFinite(tutar) || tutar <= 0) continue;

      toplam += tutar;

      const yontem = kasaYontemi(o);

      if (yontem === "Nakit") nakit += tutar;
      else if (yontem === "Kart") kart += tutar;
      else diger += tutar;
    }

    // QR tahsilat toplamları
    for (const p of qrOdemeler) {
      const tutar = Number(p.amount || 0);

      if (!Number.isFinite(tutar) || tutar <= 0) continue;

      toplam += tutar;

      const yontem = kasaYontemi(p);

      if (yontem === "Nakit") nakit += tutar;
      else if (yontem === "Kart") kart += tutar;
      else diger += tutar;
    }

    // Raporu önce kaydet
    await addDoc(collection(db, "dayLogs"), {
      date: todayStr,
      closedAt: serverTimestamp(),
      total: toplam,
      cash: nakit,
      card: kart,
      other: diger,
      orderCount: normalSiparisler.length,
      qrPaymentCount: qrOdemeler.length
    });

    // Rapor kaydı başarılı olduktan sonra
    // sadece rapora dahil edilen kayıtları işaretle.
    for (const o of normalSiparisler) {
      if (!o.id) continue;

      await updateDoc(doc(db, "orders", o.id), {
        dayClosed: true
      });
    }

    for (const p of qrOdemeler) {
      if (!p.id) continue;

      await updateDoc(doc(db, "payments", p.id), {
        dayClosed: true
      });
    }

    // Yerel ekran verilerini yenile
    const [freshOrders, freshPayments] = await Promise.all([
      getDocs(collection(db, "orders")),
      getDocs(collection(db, "payments"))
    ]);

    kasaOrders = freshOrders.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    kasaPayments = freshPayments.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    gunlukKasayiGoster();

    alert(
      `Gün sonu kaydedildi!\n\n` +
      `Tarih: ${todayStr}\n` +
      `Toplam: ${toplam.toLocaleString("tr-TR")} ₺\n` +
      `Nakit: ${nakit.toLocaleString("tr-TR")} ₺\n` +
      `Kart / POS: ${kart.toLocaleString("tr-TR")} ₺\n` +
      `Diğer: ${diger.toLocaleString("tr-TR")} ₺\n\n` +
      `Normal sipariş: ${normalSiparisler.length}\n` +
      `QR tahsilatı: ${qrOdemeler.length}`
    );

  } catch (error) {
    console.error("Gün sonu hatası:", error);

    alert(
      "Gün sonu işlemi tamamen tamamlanamamış olabilir.\n" +
      "Tekrar denemeden önce dayLogs koleksiyonunu ve " +
      "dayClosed alanlarını kontrol edin.\n\n" +
      (error.code || "") + " - " +
      (error.message || String(error))
    );

  } finally {
    gunSonuIsleniyor = false;
  }
};




 // =========================
 // GÜN AÇILIŞ KONTROLÜ
 // =========================

async function gunAcilisKontrol() {
  try {
    const now = new Date();

    const todayStr =
      `${now.getFullYear()}-` +
      `${String(now.getMonth() + 1).padStart(2, "0")}-` +
      `${String(now.getDate()).padStart(2, "0")}`;

    // Günlük kayıtları kontrol et
    const snap = await getDocs(collection(db, "dayLogs"));

    const bugunAcilisVar = snap.docs.some(d => {
      const kayit = d.data();

      return kayit.date === todayStr &&
        kayit.type === "opening";
    });

    if (bugunAcilisVar) {
      console.log("Bugünün açılışı zaten yapılmış.");
      return;
    }

    // Gün açılış kaydı oluştur
    await addDoc(collection(db, "dayLogs"), {
      date: todayStr,
      type: "opening",
      openedAt: serverTimestamp()
    });

    console.log("Gün açılışı kaydedildi.");

  } catch (error) {
    console.error("Gün açılışı kontrol edilemedi:", error);
  }
}

// Panel açıldığında kontrol et
gunAcilisKontrol();
