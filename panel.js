
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

function hesapVeOdemeGoster() {
  const alan = document.getElementById("bills");
  let html = "";

  // Normal hesap istekleri
  if (billRequestsData.length) {
    html += `<h3>🧾 Hesap İstekleri</h3>`;

    billRequestsData.forEach(b => {
      html += `
        <div class="card">
          <b>Masa: ${guvenliMetin(b.table)}</b><br>
          <small>${guvenliMetin(b.tarih)}</small><br>
          <p>Masadaki tüm hesabın tahsil edilmesi isteniyor.</p>
          <button class="orange"
            onclick="odemeAl('${guvenliMetin(b.table)}','${b.id}','Nakit')">
            💵 Nakit al
          </button>
          <button class="green"
            onclick="odemeAl('${guvenliMetin(b.table)}','${b.id}','Kart')">
            💳 Kart al
          </button>
        </div>`;
    });
  }

  // QR menüden gelen ödeme talepleri
  if (paymentRequestsData.length) {
    html += `<h3>💸 QR Ödeme Talepleri</h3>`;

    paymentRequestsData.forEach(p => {
      html += `
        <div class="card">
          <b>Masa: ${guvenliMetin(p.table)}</b><br>
          Müşteri: ${guvenliMetin(p.personName || "Belirtilmemiş")}<br>
          Tutar: <b>${Number(p.amount || 0).toLocaleString("tr-TR")} ₺</b><br>
          Tür: ${guvenliMetin(p.scope === "shared" ? "Ortak hesaba katkı" : "Kendi hesabı")}<br>
          İstenen yöntem: ${guvenliMetin(p.method || "Belirtilmemiş")}<br>
          <small>${guvenliMetin(p.tarih || "")}</small><br>
          <span style="color:#ff9800">⏳ Ödeme onayı bekleniyor</span><br>

          <button class="green"
            onclick="qrOdemeyiOnayla('${p.id}')">
            ✔ Tahsilatı Onayla
          </button>

          <button class="red"
            onclick="qrOdemeyiReddet('${p.id}')">
            ✖ Reddet
          </button>
        </div>`;
    });
  }

    // Masanın toplam borcunu ve onaylı ödemelerini hesapla
    const masaSiparisleri = await getDocs(collection(db, "orders"));
    const masaOdemeleri = await getDocs(collection(db, "payments"));

    const acikSiparisler = masaSiparisleri.docs.filter(d => {
      const o = d.data();
      return String(o.table) === String(talep.table) && o.closed !== true;
    });

    const masaToplami = acikSiparisler.reduce(
      (sum, d) => sum + Number(d.data().total || 0), 0
    );

    const onayliOdemeler = masaOdemeleri.docs
      .filter(d => {
        const p = d.data();
        return String(p.table) === String(talep.table)
          && p.status === "confirmed";
      })
      .reduce((sum, d) => sum + Number(d.data().amount || 0), 0);

    // Toplam hesap tamamen ödendiyse açık siparişleri kapat
    if (masaToplami > 0 && onayliOdemeler >= masaToplami) {
      for (const d of acikSiparisler) {
        await updateDoc(doc(db, "orders", d.id), {
          closed: true,
          paymentType: "QR",
          paidAt: serverTimestamp()
        });
      }

    alan.innerHTML = html || "Bekleyen hesap veya ödeme isteği yok.";
}

// Hesap isteklerini dinle
onSnapshot(collection(db, "billRequests"), snap => {
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
}, error => {
  console.error("Hesap istekleri okunamadı:", error);
});

// QR ödeme taleplerini dinle
onSnapshot(collection(db, "paymentRequests"), snap => {
  paymentRequestsData = snap.docs
    .filter(d => !["confirmed", "rejected"].includes(
      String(d.data().status || "").toLowerCase()
    ))
    .map(d => {
      const p = d.data();
      return {
        id: d.id,
        ...p,
        tarih: p.createdAt?.toDate?.().toLocaleString("tr-TR") || ""
      };
    });

  hesapVeOdemeGoster();
}, error => {
  console.error("QR ödeme talepleri okunamadı:", error);
  document.getElementById("bills").textContent =
    "Ödeme talepleri yüklenemedi. Firebase kurallarını kontrol edin.";
});

// QR ödeme tahsilatını onayla
window.qrOdemeyiOnayla = async id => {
  const talep = paymentRequestsData.find(p => p.id === id);
  if (!talep) return alert("Ödeme talebi bulunamadı.");

  const tutar = Number(talep.amount || 0);
  if (tutar <= 0) return alert("Ödeme tutarı geçersiz.");

  const secim = prompt(
    "Tahsilatı gerçekten aldıysanız ödeme yöntemini yazın:\nNakit veya Kart",
    talep.method === "Nakit" ? "Nakit" : "Kart"
  );

  if (secim === null) return;

  const yontem = secim.trim().toLocaleLowerCase("tr-TR");
  let paymentType;

  if (yontem === "nakit") paymentType = "Nakit";
  else if (yontem === "kart" || yontem === "pos") paymentType = "Kart";
  else return alert("Yöntem olarak yalnızca Nakit veya Kart yazın.");

  if (!confirm(
    `${talep.table} için ${tutar} ₺ ${paymentType} tahsilatını gerçekten aldınız mı?`
  )) return;

  try {
    // Tahsilat kaydı
    await addDoc(collection(db, "payments"), {
      table: talep.table,
      personId: talep.personId || null,
      personName: talep.personName || "",
      scope: talep.scope || "own",
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

    alert("Tahsilat kaydedildi. Masa siparişleri otomatik kapatılmadı.");
  } catch (error) {
    console.error("QR tahsilat hatası:", error);
    alert("Tahsilat kaydedilemedi: " + (error.message || error));
  }
};

// QR ödeme talebini reddet
window.qrOdemeyiReddet = async id => {
  if (!confirm("Bu ödeme talebini reddetmek istiyor musunuz?")) return;

  try {
    await updateDoc(doc(db, "paymentRequests", id), {
      status: "rejected",
      rejectedAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    alert("Talep reddedilemedi.");
  }
};

// =========================
// ÖDEME AL
// =========================

window.odemeAl = async (masa, requestId, tip) => {
  if (!confirm(`${masa} için ${tip} ödemesini aldınız mı?`)) return;

  try {
    const snap = await getDocs(collection(db, "orders"));

    for (const d of snap.docs) {
      const o = d.data();

      if (String(o.table) === String(masa) && !o.closed) {
        await updateDoc(doc(db, "orders", d.id), {
          closed: true,
          paymentType: tip,
          paidAt: serverTimestamp(),
          dayClosed: false
        });
      }
    }

    await deleteDoc(doc(db, "billRequests", requestId));
    alert("Ödeme kaydedildi.");
  } catch (error) {
    console.error(error);
    alert("Ödeme kaydedilemedi. Firebase bağlantısını kontrol edin.");
  }
};


 // =========================
 // GÜNLÜK KASA — SİPARİŞLER + QR ÖDEMELERİ
 // =========================

let kasaOrders = [];
let kasaPayments = [];

function gunlukKasayiGoster() {
  let toplam = 0;
  let nakit = 0;
  let kart = 0;

  const today = new Date();

  // Eski sistemden kaydedilen kapatılmış siparişler
  kasaOrders.forEach(o => {
    if (!o.closed || !o.paymentType || !o.paidAt || o.dayClosed) return;

    const tarih = o.paidAt?.toDate?.();
    if (!tarih || !ayniGun(tarih, today)) return;

    const tutar = Number(o.total || 0);
    toplam += tutar;

    if (o.paymentType === "Nakit") nakit += tutar;
    if (o.paymentType === "Kart") kart += tutar;
  });

  // QR menüden alınmış ve onaylanmış tahsilatlar
  kasaPayments.forEach(p => {
    if (p.status !== "confirmed" || p.dayClosed === true) return;

    const tarih = p.paidAt?.toDate?.() || p.createdAt?.toDate?.();
    if (!tarih || !ayniGun(tarih, today)) return;

    const tutar = Number(p.amount || 0);
    toplam += tutar;

    const yontem = p.paymentType || p.method;

    if (yontem === "Nakit") nakit += tutar;
    if (yontem === "Kart" || yontem === "POS") kart += tutar;
  });

  document.getElementById("kasa").innerHTML = `
    <div class="card">
      <b>Toplam: ${toplam.toLocaleString("tr-TR")}₺</b><br>
      💵 Nakit: ${nakit.toLocaleString("tr-TR")}₺<br>
      💳 Kart: ${kart.toLocaleString("tr-TR")}₺
    </div>
  `;
}

function ayniGun(a, b) {
  return a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
}

onSnapshot(collection(db, "orders"), snap => {
  kasaOrders = snap.docs.map(d => d.data());
  gunlukKasayiGoster();
}, error => {
  console.error("Sipariş kasası okunamadı:", error);
});

onSnapshot(collection(db, "payments"), snap => {
  kasaPayments = snap.docs.map(d => d.data());
  gunlukKasayiGoster();
}, error => {
  console.error("QR ödeme kasası okunamadı:", error);
});

 // =========================
 // GÜN SONU KAPAT
 // =========================

window.gunSonuKapat = async () => {
  if (!confirm("Gün sonu alınsın mı? Yalnızca ödemesi alınmış siparişler kaydedilecek; açık masalar korunacak.")) return;

  try {
    const now = new Date();
    const todayStr =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const snap = await getDocs(collection(db, "orders"));

    let toplam = 0;
    let nakit = 0;
    let kart = 0;
    let sayi = 0;

    for (const d of snap.docs) {
      const o = d.data();

      // Yalnızca gerçekten ödenmiş, henüz gün sonuna alınmamış siparişler
      if (
        o.closed === true &&
        o.paymentType &&
        o.paidAt &&
        o.dayClosed !== true
      ) {
        const tutar = Number(o.total || 0);

        toplam += tutar;
        sayi++;

        if (o.paymentType === "Nakit") nakit += tutar;
        if (o.paymentType === "Kart") kart += tutar;
      }
    }

    // Günlük raporu kaydet. Siparişleri değiştirme ve açık masaları kapatma.
    await addDoc(collection(db, "dayLogs"), {
      date: todayStr,
      closedAt: serverTimestamp(),
      total: toplam,
      cash: nakit,
      card: kart,
      orderCount: sayi
    });

    // Rapor kaydı başarılı olduktan sonra ödenmiş siparişleri işaretle.
    for (const d of snap.docs) {
      const o = d.data();

      if (
        o.closed === true &&
        o.paymentType &&
        o.paidAt &&
        o.dayClosed !== true
      ) {
        await updateDoc(doc(db, "orders", d.id), {
          dayClosed: true
        });
      }
    }

    alert(
      `Gün sonu kaydedildi!\nToplam: ${toplam} TL\nNakit: ${nakit} TL\nKart: ${kart} TL\nÖdenmiş sipariş sayısı: ${sayi}`
    );
  } catch (error) {
    console.error("Gün sonu hatası:", error);
    alert("Gün sonu kaydedilemedi: " + (error.code || "") + " - " + (error.message || error));
  }
};


// =========================
// GÜN AÇILIŞ KONTROLÜ
// =========================

async function gunAcilisKontrol() {
  try {
    const now = new Date();
    const todayStr =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const snap = await getDocs(collection(db, "dayLogs"));
    let bugunVar = false;

    snap.forEach(d => {
      if (d.data().date === todayStr) bugunVar = true;
    });

    if (!bugunVar) {
      await addDoc(collection(db, "dayLogs"), {
        date: todayStr,
        openedAt: serverTimestamp()
      });

      console.log("Gün açılışı yapıldı");
    }
  } catch (error) {
    console.error("Gün açılışı kontrol edilemedi:", error);
  }
}

gunAcilisKontrol();
