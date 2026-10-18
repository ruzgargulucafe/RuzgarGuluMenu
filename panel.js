
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
// HESAP İSTEKLERİ
// =========================

onSnapshot(collection(db, "billRequests"), async snap => {
  try {
    const ordersSnap = await getDocs(collection(db, "orders"));
    let html = "";

    snap.forEach(d => {
      const b = d.data();
      const tarih = b.createdAt?.toDate?.().toLocaleString("tr-TR") || "";

      let toplam = 0;
      let urunler = "";

      ordersSnap.forEach(oDoc => {
        const o = oDoc.data();

        if (o.table === b.table && !o.closed) {
          toplam += Number(o.total || 0);
          urunler += urunListesi(o.items);
        }
      });

      html += `
        <div class="card">
          <b>Masa: ${guvenliMetin(b.table)}</b><br><br>
          ${urunler || "Ürün bulunamadı."}
          <p><b>Toplam: ${toplam}₺</b></p>
          <small>${tarih}</small><br><br>

          <button class="orange"
            onclick="odemeAl('${guvenliMetin(b.table)}','${d.id}','Nakit')">
            💵 Nakit
          </button>

          <button class="green"
            onclick="odemeAl('${guvenliMetin(b.table)}','${d.id}','Kart')">
            💳 Kart
          </button>
        </div>
      `;
    });

    document.getElementById("bills").innerHTML = html || "Yok";
  } catch (error) {
    console.error("Hesap istekleri okunamadı:", error);
    document.getElementById("bills").textContent = "Hesap istekleri yüklenemedi.";
  }
});

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
// GÜNLÜK KASA
// =========================

onSnapshot(collection(db, "orders"), snap => {
  let toplam = 0;
  let nakit = 0;
  let kart = 0;

  const today = new Date();

  snap.forEach(d => {
    const o = d.data();
    if (!o || !o.closed || !o.paymentType || !o.paidAt || o.dayClosed) return;

    let tarih;
    try {
      tarih = o.paidAt.toDate();
    } catch {
      return;
    }

    if (
      tarih.getDate() === today.getDate() &&
      tarih.getMonth() === today.getMonth() &&
      tarih.getFullYear() === today.getFullYear()
    ) {
      const tutar = Number(o.total || 0);
      toplam += tutar;

      if (o.paymentType === "Nakit") nakit += tutar;
      if (o.paymentType === "Kart") kart += tutar;
    }
  });

  document.getElementById("kasa").innerHTML = `
    <div class="card">
      <b>Toplam:</b> ${toplam}₺<br>
      💵 Nakit: ${nakit}₺<br>
      💳 Kart: ${kart}₺
    </div>
  `;
}, error => {
  console.error("Kasa yüklenemedi:", error);
  document.getElementById("kasa").textContent = "Kasa yüklenemedi.";
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
