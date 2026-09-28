// 🔥 FIREBASE
import { db } from "./app.js";

import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 📌 MASA
const params = new URLSearchParams(location.search);
const masa = params.get("table") || "Bilinmiyor";
document.getElementById("masaNo").innerText = "Masa: " + masa;

// 🛒 ELEMENTLER
const menuContent = document.getElementById("menuContent");
const cartButton = document.getElementById("cartButton");
const cartPanel = document.getElementById("cartPanel");
const closeCart = document.getElementById("closeCart");
const cartItems = document.getElementById("cartItems");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const clearCart = document.getElementById("clearCart");
const finishOrder = document.getElementById("finishOrder");
const orderNote = document.getElementById("orderNote");

// 🛒 SEPET
let cart = [];

// 📦 ÜRÜNLERİ YÜKLE
async function loadProducts(){
  const snap = await getDocs(collection(db,"products"));

  let html = "";

  snap.forEach(doc=>{
    const p = doc.data();

    html += `
      <div class="product">
        <h3>${p.name}</h3>
        <p>${p.description || ""}</p>
        <b>${p.price}₺</b>
        <button onclick="add('${doc.id}','${p.name}',${p.price})">
          Sepete Ekle
        </button>
      </div>
    `;
  });

  menuContent.innerHTML = html;
}

// ➕ SEPETE EKLE
window.add = (id,name,price)=>{
  const item = cart.find(x=>x.id===id);

  if(item){
    item.qty++;
  }else{
    cart.push({id,name,price,qty:1});
  }

  updateCart();
};

// 🔄 SEPET GÜNCELLE
function updateCart(){

  let html="";
  let total=0;

  cart.forEach((i,index)=>{
    total += i.price*i.qty;

    html += `
      <div>
        ${i.name} x${i.qty}
        <button onclick="inc(${index})">+</button>
        <button onclick="dec(${index})">-</button>
      </div>
    `;
  });

  cartItems.innerHTML = html;
  cartTotal.innerText = "Toplam: "+total+"₺";
  cartCount.innerText = cart.length;
}

// ➕➖
window.inc = (i)=>{
  cart[i].qty++;
  updateCart();
};

window.dec = (i)=>{
  cart[i].qty--;
  if(cart[i].qty<=0) cart.splice(i,1);
  updateCart();
};

// 🧹 TEMİZLE
clearCart.onclick = ()=>{
  cart=[];
  updateCart();
};

// 📦 SİPARİŞ
finishOrder.onclick = async ()=>{

  if(cart.length===0){
    alert("Sepet boş");
    return;
  }

  let total=0;
  cart.forEach(i=> total+=i.price*i.qty);

  await addDoc(collection(db,"orders"),{
    table: masa,
    items: cart,
    total: total,
    status:"Bekliyor",
    note: orderNote.value,
    createdAt: serverTimestamp()
  });

  alert("Sipariş gönderildi");

  cart=[];
  updateCart();
};

// 🛒 PANEL
cartButton.onclick = ()=> cartPanel.classList.add("active");
closeCart.onclick = ()=> cartPanel.classList.remove("active");

// 🚀 START
loadProducts();
