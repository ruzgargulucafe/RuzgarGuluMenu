import { db } from "./app.js";

import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// =========================
// SİPARİŞLER + MASALAR
// =========================

onSnapshot(collection(db,"orders"), snap=>{

  let yeniHTML="";
  let hazirHTML="";
  let masalar = {};

  snap.forEach(d=>{

    const o = d.data();
    if(!o) return;
    if(o.closed) return;

    if(!masalar[o.table]) masalar[o.table] = 0;
    masalar[o.table] += o.total || 0;

    let urunler="";
    (o.items || []).forEach(i=>{
      urunler += `${i.name} x${i.qty}<br>`;
    });

    if(o.status==="Bekliyor"){
      yeniHTML += `
      <div class="card">
        <b>${o.table}</b><br>
        ${urunler}
        <b>${o.total}₺</b><br>
        <button class="green" onclick="hazir('${d.id}')">✔ Hazır</button>
      </div>`;
    }

    if(o.status==="Hazır"){
      hazirHTML += `
      <div class="card">
        <b>${o.table}</b><br>
        ${urunler}
        <b>${o.total}₺</b><br>
        <span style="color:lightgreen">✔ Hazır</span>
      </div>`;
    }

  });

  document.getElementById("yeni").innerHTML = yeniHTML || "Sipariş yok";
  document.getElementById("hazir").innerHTML = hazirHTML || "Yok";

  let masaHTML="";
  for(const m in masalar){
    masaHTML += `
    <div class="card">
      <b>${m}</b><br>
      Toplam: ${masalar[m]}₺
    </div>`;
  }

  document.getElementById("masalar").innerHTML = masaHTML || "Yok";

});


// =========================
// HAZIR BUTONU
// =========================

window.hazir = async(id)=>{
  await updateDoc(doc(db,"orders",id),{
    status:"Hazır"
  });
};


// =========================
// GARSON
// =========================

onSnapshot(collection(db,"calls"), snap=>{

  let html="";

  snap.forEach(d=>{
    const c = d.data();
    const tarih = c.createdAt?.toDate()?.toLocaleString() || "";

    html += `
    <div class="card">
      Masa: ${c.table}<br>
      <small>${tarih}</small><br>
      <button class="red" onclick="silCall('${d.id}')">Temizle</button>
    </div>`;
  });

  document.getElementById("calls").innerHTML = html || "Yok";

});

window.silCall = async(id)=>{
  await deleteDoc(doc(db,"calls",id));
};


// =========================
// HESAP İSTEKLERİ
// =========================

onSnapshot(collection(db,"billRequests"), async snap=>{

  let html="";

  const ordersSnap = await getDocs(collection(db,"orders"));

  snap.forEach(d=>{

    const b = d.data();
    const tarih = b.createdAt?.toDate()?.toLocaleString() || "";

    let toplam = 0;
    let urunler = "";

    ordersSnap.forEach(oDoc=>{
      const o = oDoc.data();

      if(o.table === b.table && !o.closed){

        toplam += o.total || 0;

        (o.items || []).forEach(i=>{
          urunler += `${i.name} x${i.qty}<br>`;
        });

      }
    });

    html += `
    <div class="card">
      <b>Masa: ${b.table}</b><br><br>
      ${urunler}
      <b>Toplam: ${toplam}₺</b><br>
      <small>${tarih}</small><br><br>

      <button class="orange" onclick="odemeAl('${b.table}','${d.id}','Nakit')">
        💵 Nakit
      </button>

      <button class="green" onclick="odemeAl('${b.table}','${d.id}','Kart')">
        💳 Kart
      </button>
    </div>`;
  });

  document.getElementById("bills").innerHTML = html || "Yok";

});


// =========================
// ÖDEME AL
// =========================

window.odemeAl = async (masa, requestId, tip)=>{

  const snap = await getDocs(collection(db,"orders"));

  for(const d of snap.docs){
    const o = d.data();

    if(o.table === masa && !o.closed){

      await updateDoc(doc(db,"orders",d.id),{
        closed: true,
        paymentType: tip,
        paidAt: serverTimestamp(),
        dayClosed: false
      });

    }
  }

  await deleteDoc(doc(db,"billRequests",requestId));
};


// =========================
// GÜNLÜK KASA
// =========================

onSnapshot(collection(db,"orders"), snap=>{

  let toplam = 0;
  let nakit = 0;
  let kart = 0;

  const today = new Date();

  snap.forEach(d=>{

    const o = d.data();

    if(!o) return;
    if(!o.closed) return;
    if(!o.paymentType) return;
    if(!o.paidAt) return;
    if(o.dayClosed) return;
    
    let tarih;

    try{
      tarih = o.paidAt.toDate();
    }catch{
      return;
    }

    if(
      tarih.getDate() === today.getDate() &&
      tarih.getMonth() === today.getMonth() &&
      tarih.getFullYear() === today.getFullYear()
    ){

      toplam += o.total || 0;

      if(o.paymentType === "Nakit"){
        nakit += o.total || 0;
      }

      if(o.paymentType === "Kart"){
        kart += o.total || 0;
      }

    }

  });

  document.getElementById("kasa").innerHTML = `
    <div class="card">
      <b>Toplam:</b> ${toplam}₺<br>
      💵 Nakit: ${nakit}₺<br>
      💳 Kart: ${kart}₺
    </div>
  `;

});

window.gunSonuKapat = async ()=>{

  if(!confirm("Gün sonu alınsın mı?")) return;

  const now = new Date();

  // 📌 bugünün tarihi
  const todayStr = now.toISOString().split("T")[0];

  // 🔥 orders kapat
  const snap = await getDocs(collection(db,"orders"));

  for(const d of snap.docs){
    const o = d.data();

    if(!o.closed){
      await updateDoc(doc(db,"orders",d.id),{
        closed: true,
        paymentType: "Nakit",
        paidAt: serverTimestamp(),
        dayClosed: true
      });
    }else if(!o.dayClosed){
      await updateDoc(doc(db,"orders",d.id),{
        dayClosed: true
      });
    }
  }

  // 🔥 gün sonu kaydı oluştur
  await addDoc(collection(db,"dayLogs"),{
    date: todayStr,
    closedAt: serverTimestamp()
  });

  alert("Gün sonu alındı ✅");
};

import { addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

async function gunAcilisKontrol(){

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  const snap = await getDocs(collection(db,"dayLogs"));

  let bugunVar = false;

  snap.forEach(d=>{
    const data = d.data();
    if(data.date === todayStr){
      bugunVar = true;
    }
  });

  // 📌 eğer bugün kayıt yoksa → açılış yap
  if(!bugunVar){
    await addDoc(collection(db,"dayLogs"),{
      date: todayStr,
      openedAt: serverTimestamp()
    });

    console.log("Gün açılışı yapıldı");
  }
}

gunAcilisKontrol();
