import Chart from 'chart.js/auto';
import { auth, db, storage } from './services/firebase.js';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';
// Tải ảnh hóa đơn lên Firebase Storage

async function uploadReceipt(file) {
  if (!file) return null;

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP!');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ảnh hóa đơn không được vượt quá 5MB!');
  }

  const formData = new FormData();
  formData.append('file', file);

  const result = await apiRequest('/receipts/upload', {
    method: 'POST',
    body: formData
  });

  return result.data.receiptPath;
}

import { renderLogin } from './pages/login.js';
import { renderRegister } from './pages/register.js';
let dashboardMonth = new Date().toISOString().slice(0, 7);
const app = document.querySelector('#app');
function loadData(key, defaultValue) {
  const savedData = localStorage.getItem(key);
  if (savedData) {
    try { return JSON.parse(savedData); }
    catch (error) { console.error('Không thể đọc dữ liệu LocalStorage:', error); }
  }
  return defaultValue;
}

const defaultCategories = [
  { id: 1, name: 'Ăn uống', type: 'expense' },
  { id: 2, name: 'Mua sắm', type: 'expense' },
  { id: 3, name: 'Di chuyển', type: 'expense' },
  { id: 4, name: 'Hóa đơn', type: 'expense' },
  { id: 5, name: 'Giải trí', type: 'expense' },
  { id: 6, name: 'Lương', type: 'income' },
  { id: 7, name: 'Thưởng', type: 'income' }
];

// Dữ liệu LocalStorage được giữ làm bản dự phòng, không tự động nhập lên tài khoản mới.
let transactions = loadData('QLCT_transactions', []);
let currentPage = 'transactions';
let searchText = '';
let filterType = 'all';
let filterMonth = '';
let categories = loadData('QLCT_categories', defaultCategories);
let budgets = loadData('QLCT_budgets', []);
let isCloudDataReady = false;
let currentUserId = null;

const API_BASE_URL =
  'https://budget-management-api-upqn6d2icq-as.a.run.app';

async function getReceiptBlob(transactionId) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Bạn chưa đăng nhập!');
  }

  const token = await user.getIdToken();

  const response = await fetch(
    `${API_BASE_URL}/receipts/${encodeURIComponent(transactionId)}/view`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Không thể tải ảnh: ${response.status}`);
  }

  return await response.blob();
}


const cloudCollections = ['transactions', 'categories', 'budgets'];
async function apiRequest(endpoint, options = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('Bạn chưa đăng nhập!');
  }

  const token = await user.getIdToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers
    }
  });

  const responseText = await response.text();

let result = {};

try {
  result = JSON.parse(responseText);
} catch {
  result = { message: responseText };
}

console.log('API ERROR:', {
  endpoint,
  status: response.status,
  response: result
});

if (!response.ok) {
  throw new Error(
    result.error ||
    result.message ||
    `Lỗi API: ${response.status}`
  );
}

return result;

  return result;
}
async function loadCloudData(userId) {
  try {
    // Lấy danh mục
    const categoryResult = await apiRequest('/categories');
    categories = categoryResult.data || [];

    // Lấy giao dịch
    const transactionResult = await apiRequest('/transactions');
    transactions = (transactionResult.data || []).map(item => ({
      ...item,
      name: item.note || '',
      receiptUrl: '',
      receiptPath: item.receiptPath || ''
    }));

    // Lấy ngân sách của tháng hiện tại
    const today = new Date();
    const currentMonth =
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const budgetResult = await apiRequest(
      `/budgets?month=${currentMonth}`
    );

    budgets = budgetResult.data || [];

    currentUserId = userId;
    isCloudDataReady = true;

    console.log('Đã tải dữ liệu từ Backend:', {
      categories,
      transactions,
      budgets
    });

  } catch (error) {
    console.error('Lỗi tải dữ liệu Backend:', error);
    isCloudDataReady = false;
    alert('Không thể tải dữ liệu từ máy chủ: ' + error.message);
  }
}

async function syncCollection(collectionName, items) {
  const ref = collection(db, 'users', currentUserId, collectionName);
  const snapshot = await getDocs(ref);
  const currentIds = new Set(items.map(item => String(item.id)));

  // Ghi mới hoặc cập nhật các tài liệu hiện có.
  await Promise.all(items.map(item =>
    setDoc(doc(ref, String(item.id)), item)
  ));

  // Xóa trên Firestore những tài liệu đã bị xóa khỏi giao diện.
  const removed = snapshot.docs.filter(item => !currentIds.has(item.id));
  await Promise.all(removed.map(item => deleteDoc(item.ref)));
}

async function saveData() {
  // Luôn giữ bản sao local để dự phòng khi mất mạng.
  localStorage.setItem('QLCT_transactions', JSON.stringify(transactions));
  localStorage.setItem('QLCT_categories', JSON.stringify(categories));
  localStorage.setItem('QLCT_budgets', JSON.stringify(budgets));

  if (!currentUserId || !isCloudDataReady) return;

  try {
    await Promise.all([
      syncCollection('transactions', transactions),
      syncCollection('categories', categories),
      syncCollection('budgets', budgets)
    ]);
    console.log('Đã đồng bộ dữ liệu lên Cloud Firestore.');
  } catch (error) {
    console.error('Không thể lưu dữ liệu lên Firestore:', error);
    alert('Không thể lưu dữ liệu lên Firestore. Vui lòng kiểm tra kết nối và quyền truy cập.');
  }
}

let expenseChart = null;
let dashboardChart = null;


function renderLayout() {
  const user = auth.currentUser;
  const userName = user?.displayName || 'Người dùng';
  const initial = userName.charAt(0).toUpperCase();

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-icon">N4</div>
          <div>
            <h2 class="logo">QLCT</h2>
            <span class="brand-subtitle">QUẢN LÝ TÀI CHÍNH</span>
          </div>
        </div>

        <p class="menu-label">MENU CHÍNH</p>

        <nav class="menu">
          <button class="menu-item" data-page="dashboard">
            <span class="nav-icon">▦</span>
            <span>Tổng quan</span>
          </button>

          <button class="menu-item" data-page="transactions">
            <span class="nav-icon">↔</span>
            <span>Giao dịch</span>
          </button>

          <button class="menu-item" data-page="reports">
            <span class="nav-icon">▥</span>
            <span>Thống kê</span>
          </button>

          <button class="menu-item" data-page="budgets">
            <span class="nav-icon">◷</span>
            <span>Ngân sách</span>
          </button>

          <button class="menu-item" data-page="categories">
            <span class="nav-icon">▤</span>
            <span>Danh mục</span>
          </button>
        </nav>

        <div class="sidebar-bottom">
          <button class="menu-item logout-item" id="logoutBtn">
            <span class="nav-icon">⇥</span>
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      <main class="main-content">
        <header class="header">
          <div class="header-welcome">
            <h3>Xin chào, ${userName}!</h3>
            <p>Chúc bạn một ngày quản lý tài chính hiệu quả.</p>
          </div>

          <div class="user-info">
            <div class="avatar">${initial}</div>
            <div class="user-details">
              <strong>${userName}</strong>
              <span>Tài khoản của bạn</span>
            </div>
          </div>
        </header>

        <section class="page-content" id="pageContent"></section>
      </main>
    </div>
  `;

  document.querySelector('#logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
  });

  showPage('dashboard');
}


// Hiển thị đăng nhập
function showLogin() {
  app.innerHTML = renderLogin();

  document.querySelector('#showRegister').addEventListener('click', event => {
    event.preventDefault();
    showRegister();
  });

  document.querySelector('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(event.target);
    const email = formData.get('email').trim();
    const password = formData.get('password');
    const error = document.querySelector('#loginError');

    try {
      error.textContent = '';
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      error.textContent = getAuthErrorMessage(err.code);
    }
  });
}

// Hiển thị đăng ký
function showRegister() {
  app.innerHTML = renderRegister();

  document.querySelector('#showLogin').addEventListener('click', event => {
    event.preventDefault();
    showLogin();
  });

  document.querySelector('#registerForm').addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(event.target);

    const name = formData.get('name').trim();
    const email = formData.get('email').trim();
    const password = formData.get('password');
    const confirmPassword = formData.get('confirmPassword');

    const error = document.querySelector('#registerError');

    if (password !== confirmPassword) {
      error.textContent = 'Mật khẩu xác nhận không khớp!';
      return;
    }

    try {
      error.textContent = '';

      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(result.user, {
        displayName: name
      });

    } catch (err) {
      error.textContent = getAuthErrorMessage(err.code);
    }
  });
}

// Chuyển mã lỗi Firebase thành tiếng Việt
function getAuthErrorMessage(code) {
  const errors = {
    'auth/email-already-in-use': 'Email này đã được đăng ký.',
    'auth/invalid-email': 'Email không hợp lệ.',
    'auth/weak-password': 'Mật khẩu phải có ít nhất 6 ký tự.',
    'auth/invalid-credential': 'Email hoặc mật khẩu không chính xác.',
    'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa.',
    'auth/too-many-requests': 'Bạn thử quá nhiều lần. Hãy thử lại sau.'
  };

  return errors[code] || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

// Theo dõi trạng thái đăng nhập
onAuthStateChanged(auth, async user => {
  isCloudDataReady = false;
  currentUserId = user ? user.uid : null;

  if (user) {
    try {
      await loadCloudData(user.uid);
      renderLayout();
    } catch (error) {
      console.error('Lỗi tải dữ liệu Firestore:', error);
      app.innerHTML = `
        <div class="content-card" style="margin: 30px; padding: 24px;">
          <h2>Không thể tải dữ liệu</h2>
          <p>Không kết nối được Cloud Firestore. Hãy kiểm tra cấu hình Firebase và Security Rules.</p>
          <button class="primary-btn" onclick="location.reload()">Thử lại</button>
        </div>`;
    }
  } else {
    showLogin();
  }
});


function showPage(page) {
  currentPage = page;

  document.querySelectorAll('.menu-item[data-page]').forEach(button => {
    button.classList.toggle('active', button.dataset.page === page);
  });

  switch (page) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'transactions':
      renderTransactions();
      break;
    case 'categories':
      renderCategories();
      break;
    case 'budgets':
      renderBudgets();
      break;
    case 'reports':
      renderReports();
      break;
  }
}


function formatMoney(amount) {
  return amount.toLocaleString('vi-VN') + 'đ';
}
// Định dạng số tiền khi nhập: 200000 -> 200.000

function setupMoneyInput(input) {
  input.addEventListener('input', () => {
    const cursorPosition = input.selectionStart;
    const oldValue = input.value;
    const digitsBeforeCursor = oldValue
      .slice(0, cursorPosition)
      .replace(/\D/g, '').length;

    const number = oldValue.replace(/\D/g, '');

    const formattedValue = number
      ? Number(number).toLocaleString('vi-VN')
      : '';

    input.value = formattedValue;

    // Giữ vị trí con trỏ khi định dạng số
    let newPosition = 0;
    let digitCount = 0;

    while (newPosition < formattedValue.length &&
           digitCount < digitsBeforeCursor) {
      if (/\d/.test(formattedValue[newPosition])) {
        digitCount++;
      }
      newPosition++;
    }

    input.setSelectionRange(newPosition, newPosition);
  });
}


// Chuyển 200.000 thành số 200000 để lưu dữ liệu
function parseMoney(value) {
  return Number(String(value).replace(/\D/g, ''));
}
function formatDate(date) {
  return new Date(date + 'T00:00:00').toLocaleDateString('vi-VN');
}

function renderTransactions() {
const filtered = transactions.filter(item => {
  const matchName = item.name.toLowerCase().includes(searchText.toLowerCase());

  const matchType = filterType === 'all' || item.type === filterType;

  const matchMonth = filterMonth === '' || item.date.startsWith(filterMonth);

  return matchName && matchType && matchMonth;
});

  const monthTransactions = transactions.filter(item =>
  filterMonth === '' || item.date.startsWith(filterMonth)
);

const totalIncome = monthTransactions
  .filter(item => item.type === 'income')
  .reduce((sum, item) => sum + item.amount, 0);

const totalExpense = monthTransactions
  .filter(item => item.type === 'expense')
  .reduce((sum, item) => sum + item.amount, 0);

  document.querySelector('#pageContent').innerHTML = `
    <div class="page-heading">
      <div>
        <h2>Giao dịch</h2>
        <p>Quản lý các khoản thu và chi của bạn.</p>
      </div>

      <button class="primary-btn" id="addTransactionBtn">
        + Thêm giao dịch
      </button>
    </div>

    <div class="transaction-summary">
      <div class="summary-card">
        <span>Tổng thu</span>
        <h3 class="income-text">${formatMoney(totalIncome)}</h3>
      </div>

      <div class="summary-card">
        <span>Tổng chi</span>
        <h3 class="expense-text">${formatMoney(totalExpense)}</h3>
      </div>

      <div class="summary-card">
        <span>Số dư</span>
        <h3>${formatMoney(totalIncome - totalExpense)}</h3>
      </div>
    </div>

    <div class="content-card">

<div class="transaction-toolbar">
  <input
    type="text"
    id="searchInput"
    placeholder="Tìm kiếm giao dịch..."
    value="${searchText}"
  >

  <input
    type="month"
    id="filterMonth"
    value="${filterMonth}"
  >

<select id="filterType">
  <option value="all" ${filterType === 'all' ? 'selected' : ''}>Tất cả</option>
  <option value="income" ${filterType === 'income' ? 'selected' : ''}>Thu nhập</option>
  <option value="expense" ${filterType === 'expense' ? 'selected' : ''}>Chi tiêu</option>
</select>
</div>

      <div class="table-wrapper">
        <table class="transaction-table">
          <thead>
            <tr>
              <th>Tên giao dịch</th>
              <th>Danh mục</th>
              <th>Ngày</th>
              <th>Loại</th>
              <th>Số tiền</th>
              <th>Hóa đơn</th>
              <th>Thao tác</th>
            </tr>
          </thead>

          <tbody>
            ${
              filtered.length
                ? filtered.map(item => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.category}</td>
                    <td>${formatDate(item.date)}</td>
                    <td>
                      <span class="${item.type === 'income' ? 'income-text' : 'expense-text'}">
                        ${item.type === 'income' ? 'Thu nhập' : 'Chi tiêu'}
                      </span>
                    </td>
                    <td class="${item.type === 'income' ? 'income-text' : 'expense-text'}">
                      ${item.type === 'income' ? '+' : '-'}${formatMoney(item.amount)}
                    </td>
                    <td data-receipt-id="${item.id}">
                     ${item.receiptPath ? 'Đang tải ảnh...' : 'Chưa có'}
                    </td>
                    </td>
                    <td>
                    <button class="edit-btn" data-edit-transaction="${item.id}">
                    Sửa
                    </button>

  <button class="delete-btn" data-delete="${item.id}">
    Xóa
  </button>
</td>
                  </tr>
                `).join('')
                : '<tr><td colspan="6">Không tìm thấy giao dịch.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelector('#addTransactionBtn').addEventListener('click', showAddForm);

  document.querySelector('#searchInput').addEventListener('input', event => {
    searchText = event.target.value;
    renderTransactions();
    const input = document.querySelector('#searchInput');
    input.focus();
    input.setSelectionRange(searchText.length, searchText.length);
  });

  document.querySelector('#filterType').addEventListener('change', event => {
    filterType = event.target.value;
    renderTransactions();
  });
  document.querySelector('#filterMonth').addEventListener('change', event => {
  filterMonth = event.target.value;
  renderTransactions();
});
// Tải và hiển thị ảnh hóa đơn từ Backend
filtered.forEach(async item => {
  if (!item.receiptPath) return;

  const cells = document.querySelectorAll('[data-receipt-id]');

  const cell = Array.from(cells).find(
    element => String(element.dataset.receiptId) === String(item.id)
  );

  if (!cell) return;

  try {
    // Tải ảnh nếu chưa có URL xem trước
    if (!item.receiptUrl) {
      const blob = await getReceiptBlob(item.id);
      item.receiptUrl = URL.createObjectURL(blob);
    }

    const link = document.createElement('a');
    link.href = item.receiptUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Xem ảnh';

    cell.replaceChildren(link);

  } catch (error) {
    console.error('Lỗi tải ảnh hóa đơn:', error);
    cell.textContent = 'Lỗi tải ảnh';
  }
});
}


function showAddForm() {
  const content = document.querySelector('#pageContent');

  content.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="transactionModal">
      <form class="transaction-form" id="transactionForm">
        <h3>Thêm giao dịch</h3>

        <label>Tên giao dịch</label>
        <input
          type="text"
          name="name"
          required
          placeholder="Ví dụ: Ăn sáng"
        >

        <label>Loại giao dịch</label>
        <select name="type" id="transactionType">
          <option value="expense">Chi tiêu</option>
          <option value="income">Thu nhập</option>
        </select>

        <label>Danh mục</label>
        <select name="category" id="transactionCategory" required>
        </select>

        <label>Số tiền (VNĐ)</label>
        <input
        type="text"
        name="amount"
        id="transactionAmount"
        inputmode="numeric"
        placeholder="Ví dụ: 200.000"
        required
        >

        <label>Ngày giao dịch</label>
        <input
          type="date"
          name="date"
          value="${new Date().toISOString().slice(0, 10)}"
          required
        >
        <label>Ảnh hóa đơn (không bắt buộc)</label>
        <input
        type="file"
        name="receipt"
        id="receiptInput"
        accept="image/jpeg,image/png,image/webp"
        >

<img
  id="receiptPreview"
  style="display:none; width:150px; margin-top:10px; border-radius:8px;"
>

        <div class="form-actions">
          <button type="button" class="cancel-btn" id="cancelBtn">Hủy</button>
          <button type="submit" class="primary-btn">Lưu giao dịch</button>
        </div>
      </form>
    </div>
  `);

  const typeSelect = document.querySelector('#transactionType');
  const categorySelect = document.querySelector('#transactionCategory');
  const amountInput = document.querySelector('#transactionAmount');
  const receiptInput = document.querySelector('#receiptInput');
const receiptPreview = document.querySelector('#receiptPreview');

// Hiển thị ảnh xem trước
receiptInput.addEventListener('change', () => {
  const file = receiptInput.files[0];

  if (!file) {
    receiptPreview.style.display = 'none';
    return;
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    alert('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP!');
    receiptInput.value = '';
    receiptPreview.style.display = 'none';
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('Ảnh không được vượt quá 5MB!');
    receiptInput.value = '';
    receiptPreview.style.display = 'none';
    return;
  }

  receiptPreview.src = URL.createObjectURL(file);
  receiptPreview.style.display = 'block';
});

amountInput.addEventListener('input', () => {
  // Chỉ giữ lại chữ số
  const value = amountInput.value.replace(/\D/g, '');

  // Thêm dấu chấm phân cách hàng nghìn
  amountInput.value = value
    ? Number(value).toLocaleString('vi-VN')
    : '';
});
  function updateCategoryOptions() {
    const selectedType = typeSelect.value;

    const availableCategories = categories.filter(
      item => item.type === selectedType
    );

    categorySelect.innerHTML = availableCategories.map(item => `
      <option value="${item.id}">${item.name}</option>
    `).join('');

    if (availableCategories.length === 0) {
      categorySelect.innerHTML = '<option value="">Chưa có danh mục</option>';
    }
  }

  updateCategoryOptions();

  typeSelect.addEventListener('change', updateCategoryOptions);

  document.querySelector('#cancelBtn').addEventListener('click', () => {
    document.querySelector('#transactionModal').remove();
  });



document.querySelector('#transactionForm').addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const file = formData.get('receipt');
  const submitBtn = form.querySelector('button[type="submit"]');

  const categoryId = formData.get('category');
  const amount = parseMoney(formData.get('amount'));

  if (!categoryId) {
    alert('Vui lòng tạo danh mục trước khi thêm giao dịch!');
    return;
  }

  if (!amount || amount <= 0) {
    alert('Vui lòng nhập số tiền hợp lệ!');
    return;
  }

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Đang lưu...';

    let receiptPath = null;

// 1. Upload ảnh hóa đơn lên Backend
  if (file && file.size > 0) {
  receiptPath = await uploadReceipt(file);
  }

    // 2. Gửi giao dịch lên Backend
    const result = await apiRequest('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        category: categoryId,
        date: formData.get('date'),
        type: formData.get('type'),
        note: formData.get('name').trim(),
        receiptPath
      })
    });

    const savedTransaction = result.data;

    // 3. Cập nhật dữ liệu trên giao diện
    const categoryName = categories.find(
      item => String(item.id) === String(savedTransaction.category)
    )?.name || savedTransaction.category;

    transactions.unshift({
      ...savedTransaction,
      name: savedTransaction.note || formData.get('name').trim(),
      categoryId: savedTransaction.category,
      category: categoryName,
      receiptUrl: null,
      receiptPath: savedTransaction.receiptPath || null
    });

    // 4. Đóng form và hiển thị lại giao dịch
    document.querySelector('#transactionModal').remove();
    renderTransactions();

    alert('Thêm giao dịch thành công!');

  } catch (error) {
    console.error('Lỗi lưu giao dịch:', error);
    alert(error.message || 'Không thể lưu giao dịch!');

    submitBtn.disabled = false;
    submitBtn.textContent = 'Lưu giao dịch';
  }
});
}



function showEditTransactionForm(transaction) {
  const content = document.querySelector('#pageContent');

  const currentCategoryId =
    transaction.categoryId ||
    categories.find(item => item.name === transaction.category)?.id ||
    transaction.category;

  content.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="transactionModal">
      <form class="transaction-form" id="transactionForm">
        <h3>Sửa giao dịch</h3>

        <label>Tên giao dịch</label>
        <input
          type="text"
          name="name"
          value="${transaction.name}"
          required
        >

        <label>Loại giao dịch</label>
        <select name="type" id="transactionType">
          <option value="expense" ${transaction.type === 'expense' ? 'selected' : ''}>
            Chi tiêu
          </option>
          <option value="income" ${transaction.type === 'income' ? 'selected' : ''}>
            Thu nhập
          </option>
        </select>

        <label>Danh mục</label>
        <select name="category" id="transactionCategory" required>
        </select>

        <label>Số tiền (VNĐ)</label>
        <input
          type="text"
          name="amount"
          inputmode="numeric"
          value="${Number(transaction.amount).toLocaleString('vi-VN')}"
          required
        >

        <label>Ngày giao dịch</label>
        <input
          type="date"
          name="date"
          value="${transaction.date}"
          required
        >

        <label>Ảnh hóa đơn</label>
        <input
          type="file"
          name="receipt"
          id="editReceiptInput"
          accept="image/jpeg,image/png,image/webp"
        >

        <p id="receiptStatus">
          ${transaction.receiptPath ? 'Đang tải ảnh hóa đơn hiện tại...' : 'Chưa có ảnh hóa đơn'}
        </p>

        <img
          id="editReceiptPreview"
          alt="Ảnh hóa đơn"
          style="display:none; max-width:100%; max-height:200px; object-fit:contain; margin-top:10px;"
        >

        <div class="form-actions">
          <button type="button" class="cancel-btn" id="cancelBtn">
            Hủy
          </button>

          <button type="submit" class="primary-btn">
            Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  `);

  const typeSelect = document.querySelector('#transactionType');
  const categorySelect = document.querySelector('#transactionCategory');
  const amountInput = document.querySelector(
    '#transactionForm [name="amount"]'
  );

  const receiptInput = document.querySelector('#editReceiptInput');
  const receiptPreview = document.querySelector('#editReceiptPreview');
  const receiptStatus = document.querySelector('#receiptStatus');

  let previewUrl = null;

  setupMoneyInput(amountInput);

  // Hiển thị danh mục theo loại giao dịch
  function updateCategoryOptions() {
    const availableCategories = categories.filter(
      item => item.type === typeSelect.value
    );

    categorySelect.innerHTML = availableCategories.map(item => `
      <option
        value="${item.id}"
        ${String(item.id) === String(currentCategoryId) ? 'selected' : ''}
      >
        ${item.name}
      </option>
    `).join('');

    if (availableCategories.length === 0) {
      categorySelect.innerHTML =
        '<option value="">Chưa có danh mục</option>';
    }
  }

  updateCategoryOptions();

  typeSelect.addEventListener('change', updateCategoryOptions);

  // Tải ảnh hóa đơn hiện tại
  if (transaction.receiptPath) {
    (async () => {
      try {
        const blob = await getReceiptBlob(transaction.id);

        previewUrl = URL.createObjectURL(blob);
        receiptPreview.src = previewUrl;
        receiptPreview.style.display = 'block';

        receiptStatus.textContent = 'Ảnh hóa đơn hiện tại';
      } catch (error) {
        console.error('Lỗi tải ảnh hóa đơn hiện tại:', error);
        receiptStatus.textContent = 'Không thể tải ảnh hóa đơn hiện tại';
      }
    })();
  }

  // Xem trước ảnh mới được chọn
  receiptInput.addEventListener('change', () => {
    const file = receiptInput.files[0];

    if (!file) return;

    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP!');
      receiptInput.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Ảnh hóa đơn không được vượt quá 5MB!');
      receiptInput.value = '';
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = URL.createObjectURL(file);

    receiptPreview.src = previewUrl;
    receiptPreview.style.display = 'block';

    receiptStatus.textContent = 'Ảnh hóa đơn mới được chọn';
  });

  // Hủy chỉnh sửa
  document.querySelector('#cancelBtn').addEventListener('click', () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    document.querySelector('#transactionModal').remove();
  });

  // Lưu thay đổi
  document.querySelector('#transactionForm').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');

    const categoryId = formData.get('category');
    const amount = parseMoney(formData.get('amount'));

    if (!categoryId) {
      alert('Vui lòng chọn danh mục!');
      return;
    }

    if (!amount || amount <= 0) {
      alert('Vui lòng nhập số tiền hợp lệ!');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Đang cập nhật...';

      // Mặc định giữ ảnh hóa đơn cũ
      let receiptPath = transaction.receiptPath || null;

      // Nếu chọn ảnh mới thì upload lên Backend
      const receiptFile = formData.get('receipt');

      if (receiptFile && receiptFile.size > 0) {
        receiptPath = await uploadReceipt(receiptFile);
      }

      // Cập nhật giao dịch
      const result = await apiRequest(
        `/transactions/${encodeURIComponent(transaction.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            amount,
            category: categoryId,
            date: formData.get('date'),
            type: formData.get('type'),
            note: formData.get('name').trim(),
            receiptPath
          })
        }
      );

      const updatedTransaction = result.data;

      const categoryName = categories.find(
        item => String(item.id) === String(updatedTransaction.category)
      )?.name || updatedTransaction.category;

      transactions = transactions.map(item =>
        String(item.id) === String(transaction.id)
          ? {
              ...item,
              ...updatedTransaction,
              id: transaction.id,
              name: updatedTransaction.note || formData.get('name').trim(),
              categoryId: updatedTransaction.category,
              category: categoryName,
              receiptUrl: receiptFile && receiptFile.size > 0
                ? null
                : item.receiptUrl || null,
              receiptPath: updatedTransaction.receiptPath || receiptPath
            }
          : item
      );

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      document.querySelector('#transactionModal').remove();
      renderTransactions();

      alert('Cập nhật giao dịch thành công!');

    } catch (error) {
      console.error('Lỗi cập nhật giao dịch:', error);
      alert(error.message || 'Không thể cập nhật giao dịch!');

      submitBtn.disabled = false;
      submitBtn.textContent = 'Lưu thay đổi';
    }
  });
}

function renderCategories() {
  const content = document.querySelector('#pageContent');

  const expenseCategories = categories.filter(item => item.type === 'expense');
  const incomeCategories = categories.filter(item => item.type === 'income');

  content.innerHTML = `
    <div class="page-heading">
      <div>
        <h2>Danh mục</h2>
        <p>Quản lý danh mục thu nhập và chi tiêu.</p>
      </div>

      <button class="primary-btn" id="addCategoryBtn">
        + Thêm danh mục
      </button>
    </div>

    <div class="category-columns">
      <div class="content-card">
        <h3>Danh mục chi tiêu</h3>
        <div class="category-list">
          ${renderCategoryItems(expenseCategories)}
        </div>
      </div>

      <div class="content-card">
        <h3>Danh mục thu nhập</h3>
        <div class="category-list">
          ${renderCategoryItems(incomeCategories)}
        </div>
      </div>
    </div>
  `;
  document.querySelector('#addCategoryBtn')
    .addEventListener('click', () => {
      showAddCategoryForm();
    });
    // Bắt sự kiện nút Sửa danh mục
content.querySelectorAll('[data-edit-category]').forEach(button => {
  button.addEventListener('click', () => {
    const categoryId = button.dataset.editCategory;

    const category = categories.find(
      item => String(item.id) === String(categoryId)
    );

    if (category) {
      showEditCategoryForm(category);
    }
  });
});
}

function renderCategoryItems(items) {
  if (items.length === 0) {
    return '<p>Chưa có danh mục.</p>';
  }

  return items.map(item => `
    <div class="category-item">
      <span>${item.name}</span>

      <div class="category-actions">
        <button class="edit-btn" data-edit-category="${item.id}">
          Sửa
        </button>

        <button class="delete-btn" data-delete-category="${item.id}">
          Xóa
        </button>
      </div>
    </div>
  `).join('');
}



function showAddCategoryForm() {
  document.querySelector('#pageContent').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="categoryModal">
      <form class="transaction-form" id="categoryForm">
        <h3>Thêm danh mục</h3>

        <label>Tên danh mục</label>
        <input
          type="text"
          name="name"
          placeholder="Nhập tên danh mục"
          required
        >

        <label>Loại danh mục</label>
        <select name="type" required>
          <option value="expense">Chi tiêu</option>
          <option value="income">Thu nhập</option>
        </select>

        <div class="form-actions">
          <button type="button" class="cancel-btn" id="cancelCategoryBtn">
            Hủy
          </button>

          <button type="submit" class="primary-btn">
            Thêm danh mục
          </button>
        </div>
      </form>
    </div>
  `);

  const modal = document.querySelector('#categoryModal');
  const form = document.querySelector('#categoryForm');

  document.querySelector('#cancelCategoryBtn').addEventListener('click', () => {
    modal.remove();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = formData.get('name').trim();
    const type = formData.get('type');

    if (!name) {
      alert('Vui lòng nhập tên danh mục!');
      return;
    }

    if (categories.some(item =>
      item.name.toLowerCase() === name.toLowerCase() &&
      item.type === type
    )) {
      alert('Danh mục này đã tồn tại!');
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;

    try {
      await apiRequest('/categories', {
        method: 'POST',
        body: JSON.stringify({
          name,
          type
        })
      });

      const result = await apiRequest('/categories');
      categories = result.data || [];

      modal.remove();
      renderCategories();

      alert('Thêm danh mục thành công!');
    } catch (error) {
      console.error('Lỗi thêm danh mục:', error);
      alert('Không thể thêm danh mục: ' + error.message);
      submitButton.disabled = false;
    }
  });
}

function showEditCategoryForm(category) {
  document.querySelector('#pageContent').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="categoryModal">
      <form class="transaction-form" id="categoryForm">
        <h3>Sửa danh mục</h3>

        <label>Tên danh mục</label>
        <input
          type="text"
          name="name"
          value="${category.name}"
          placeholder="Nhập tên danh mục"
          required
        >

        <label>Loại danh mục</label>
        <select name="type" required>
          <option value="expense" ${category.type === 'expense' ? 'selected' : ''}>
            Chi tiêu
          </option>
          <option value="income" ${category.type === 'income' ? 'selected' : ''}>
            Thu nhập
          </option>
        </select>

        <div class="form-actions">
          <button type="button" class="cancel-btn" id="cancelCategoryBtn">
            Hủy
          </button>
          <button type="submit" class="primary-btn">
            Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  `);

  handleCategoryForm(category);
}

async function handleCategoryForm(category = null) {
  const isEditing = category !== null;

  document.querySelector('#cancelCategoryBtn').addEventListener('click', () => {
    document.querySelector('#categoryModal')?.remove();
  });

  document.querySelector('#categoryForm').addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(event.target);
    const name = formData.get('name').trim();
    const type = formData.get('type');

    const duplicate = categories.some(item =>
      item.name.toLowerCase() === name.toLowerCase() &&
      item.type === type &&
      String(item.id) !== String(isEditing ? category.id : '')
    );

    if (duplicate) {
      alert('Danh mục này đã tồn tại!');
      return;
    }

    try {
      if (isEditing) {
        // Cập nhật danh mục trên Backend
        await apiRequest(
          `/categories/${encodeURIComponent(category.id)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              name,
              type
            })
          }
        );

        // Tải lại danh mục từ Backend
        const result = await apiRequest('/categories');
        categories = result.data || [];

        alert('Cập nhật danh mục thành công!');
      } else {
        // Giữ nguyên luồng thêm danh mục hiện tại
        categories.push({
          id: Date.now(),
          name,
          type
        });

        saveData();
      }

      document.querySelector('#categoryModal').remove();
      renderCategories();

    } catch (error) {
      console.error('Lỗi lưu danh mục:', error);
      alert('Không thể lưu danh mục: ' + error.message);
    }
  });
}

function renderBudgets() {
  const content = document.querySelector('#pageContent');

  const today = new Date();
  const currentMonth =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const budgetData = budgets.map(item => {
    const categoryId = item.category;

    const categoryName = categories.find(
      category => String(category.id) === String(categoryId)
    )?.name || categoryId;

    const spent = transactions
      .filter(transaction => {
        const transactionMonth =
          transaction.month || transaction.date?.slice(0, 7);

        const transactionCategory =
          transaction.categoryId || transaction.category;

        return (
          transaction.type === 'expense' &&
          transactionMonth === currentMonth &&
          String(transactionCategory) === String(categoryId)
        );
      })
      .reduce((sum, transaction) =>
        sum + Number(transaction.amount), 0
      );

    return {
      ...item,
      categoryName,
      spent
    };
  });

  const totalLimit = budgetData.reduce(
    (sum, item) => sum + Number(item.limit), 0
  );

  const totalSpent = budgetData.reduce(
    (sum, item) => sum + item.spent, 0
  );

  const remaining = totalLimit - totalSpent;

  content.innerHTML = `
    <div class="page-heading">
      <div>
        <h2>Ngân sách</h2>
        <p>Theo dõi và kiểm soát chi tiêu hàng tháng.</p>
      </div>

      <button class="primary-btn" id="addBudgetBtn">
        + Thêm ngân sách
      </button>
    </div>

    <div class="transaction-summary">
      <div class="summary-card">
        <span>Tổng ngân sách</span>
        <h3>${formatMoney(totalLimit)}</h3>
      </div>

      <div class="summary-card">
        <span>Đã sử dụng</span>
        <h3 class="expense-text">${formatMoney(totalSpent)}</h3>
      </div>

      <div class="summary-card">
        <span>Còn lại</span>
        <h3 class="${remaining < 0 ? 'expense-text' : 'income-text'}">
          ${formatMoney(remaining)}
        </h3>
      </div>
    </div>

    <div class="budget-grid">
      ${
        budgetData.length
          ? budgetData.map(item => {
              const percent = item.limit > 0
                ? item.spent / item.limit * 100
                : 0;

              const safePercent = Math.min(percent, 100);

              let status = 'Trong ngân sách';
              let statusClass = 'budget-normal';

              if (percent >= 100) {
                status = 'Đã vượt ngân sách';
                statusClass = 'budget-danger';
              } else if (percent >= 80) {
                status = 'Sắp đạt giới hạn';
                statusClass = 'budget-warning';
              }

              return `
                <div class="content-card budget-card">
                  <div class="budget-card-header">
                    <h3>${item.categoryName}</h3>
                    <span class="${statusClass}">${status}</span>
                  </div>

                  <p>Đã chi: <strong>${formatMoney(item.spent)}</strong></p>
                  <p>Ngân sách: ${formatMoney(item.limit)}</p>

                  <div class="budget-progress">
                    <div
                      class="budget-progress-fill ${statusClass}"
                      style="width: ${safePercent}%"
                    ></div>
                  </div>

                  <div class="budget-footer">
                    <span>${percent.toFixed(1)}% đã sử dụng</span>
                    <span>${formatMoney(item.limit - item.spent)}</span>
                  </div>

                  <div class="budget-actions">
                    <button class="edit-btn" data-edit-budget="${item.id}">
                      Sửa
                    </button>
                    <button class="delete-btn" data-delete-budget="${item.id}">
                      Xóa
                    </button>
                  </div>
                </div>
              `;
            }).join('')
          : '<div class="content-card">Chưa có ngân sách nào.</div>'
      }
    </div>
  `;

  document.querySelector('#addBudgetBtn')
    .addEventListener('click', () => showBudgetForm());
}


function showBudgetForm(budget = null) {
  const isEditing = budget !== null;

  const today = new Date();
  const currentMonth =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const budgetMonth = isEditing
    ? budget.month
    : currentMonth;

  const availableCategories = categories.filter(category =>
    category.type === 'expense' &&
    (
      isEditing
        ? String(category.id) === String(budget.category)
        : !budgets.some(item =>
            String(item.category) === String(category.id)
          )
    )
  );

  if (!isEditing && availableCategories.length === 0) {
    alert('Không còn danh mục chi tiêu phù hợp để tạo ngân sách.');
    return;
  }

  const categoryOptions = availableCategories.map(category => `
    <option
      value="${category.id}"
      ${isEditing && String(budget.category) === String(category.id)
        ? 'selected'
        : ''}
    >
      ${category.name}
    </option>
  `).join('');

  document.querySelector('#pageContent').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="budgetModal">
      <form class="transaction-form" id="budgetForm">
        <h3>${isEditing ? 'Sửa ngân sách' : 'Thêm ngân sách'}</h3>

        <label>Danh mục chi tiêu</label>

        <select ${isEditing ? 'disabled' : ''} ${isEditing ? '' : 'name="category"'} required>
          ${categoryOptions}
        </select>

        ${isEditing
          ? `<input type="hidden" name="category" value="${budget.category}">`
          : ''
        }

        <label>Hạn mức ngân sách (VNĐ)</label>

        <input
          type="text"
          name="limit"
          inputmode="numeric"
          value="${isEditing ? Number(budget.limit).toLocaleString('vi-VN') : ''}"
          placeholder="Ví dụ: 500.000"
          required
        >

        <div class="form-actions">
          <button type="button" class="cancel-btn" id="cancelBudgetBtn">
            Hủy
          </button>

          <button type="submit" class="primary-btn">Lưu</button>
        </div>
      </form>
    </div>
  `);

  document.querySelector('#cancelBudgetBtn').addEventListener('click', () => {
    document.querySelector('#budgetModal').remove();
  });

  const limitInput = document.querySelector(
    '#budgetForm [name="limit"]'
  );

  setupMoneyInput(limitInput);

  document.querySelector('#budgetForm').addEventListener('submit', async event => {
    event.preventDefault();

    const submitButton = event.target.querySelector('[type="submit"]');
    const formData = new FormData(event.target);

    const categoryId = formData.get('category');
    const limit = parseMoney(formData.get('limit'));

    if (!categoryId || !Number.isFinite(limit) || limit <= 0) {
      alert('Vui lòng nhập hạn mức ngân sách hợp lệ!');
      return;
    }

    if (!isEditing && budgets.some(item =>
      String(item.category) === String(categoryId)
    )) {
      alert('Danh mục này đã có ngân sách!');
      return;
    }

    submitButton.disabled = true;

    try {
      await apiRequest('/budgets', {
        method: 'POST',
        body: JSON.stringify({
          category: categoryId,
          month: budgetMonth,
          limit
        })
      });

      const result = await apiRequest(
        `/budgets?month=${budgetMonth}`
      );

      budgets = result.data || [];

      document.querySelector('#budgetModal').remove();

      renderBudgets();

      alert(isEditing
        ? 'Cập nhật ngân sách thành công!'
        : 'Thêm ngân sách thành công!'
      );

    } catch (error) {
      console.error('Lỗi lưu ngân sách:', error);
      alert('Không thể lưu ngân sách: ' + error.message);
      submitButton.disabled = false;
    }
  });
}


async function renderReports() {
  const content = document.querySelector('#pageContent');

  content.innerHTML = '<div class="content-card">Đang tải thống kê...</div>';

  try {
    const today = new Date();
    const currentMonth =
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const result = await apiRequest(
      `/reports/summary?month=${currentMonth}`
    );

    const income = Number(result.totalIncome || 0);
    const expense = Number(result.totalExpense || 0);
    const balance = Number(result.balance || 0);

    const expensesByCategory = result.expensesByCategory || {};

    const reportCategories = Object.entries(expensesByCategory)
      .map(([categoryId, amount]) => {
        const categoryName = categories.find(
          item => String(item.id) === String(categoryId)
        )?.name || categoryId;

        return [categoryName, Number(amount)];
      })
      .sort((a, b) => b[1] - a[1]);

    content.innerHTML = `
      <div class="page-heading">
        <div>
          <h2>Thống kê</h2>
          <p>Tổng quan tình hình thu nhập và chi tiêu tháng ${currentMonth}.</p>
        </div>
      </div>

      <div class="transaction-summary">
        <div class="summary-card">
          <span>Tổng thu nhập</span>
          <h3 class="income-text">${formatMoney(income)}</h3>
        </div>

        <div class="summary-card">
          <span>Tổng chi tiêu</span>
          <h3 class="expense-text">${formatMoney(expense)}</h3>
        </div>

        <div class="summary-card">
          <span>Số dư hiện tại</span>
          <h3 class="${balance >= 0 ? 'income-text' : 'expense-text'}">
            ${formatMoney(balance)}
          </h3>
        </div>
      </div>

      <div class="report-layout">
        <div class="content-card report-chart-card">
          <div class="report-card-heading">
            <h3>Chi tiêu theo danh mục</h3>
            <p>Phân bổ các khoản chi của bạn</p>
          </div>

          <div class="chart-container">
            ${
              reportCategories.length
                ? '<canvas id="expenseChart"></canvas>'
                : '<p class="empty-report">Chưa có dữ liệu chi tiêu.</p>'
            }
          </div>
        </div>

        <div class="content-card report-detail-card">
          <h3>Chi tiết danh mục</h3>
          <p class="report-subtitle">
            Các khoản chi được sắp xếp từ cao xuống thấp.
          </p>

          <div class="report-category-list">
            ${
              reportCategories.length
                ? reportCategories.map(([name, amount]) => {
                    const percent = expense > 0
                      ? amount / expense * 100
                      : 0;

                    return `
                      <div class="report-category-item">
                        <div class="report-category-info">
                          <strong>${name}</strong>
                          <span>${formatMoney(amount)}</span>
                        </div>

                        <div class="report-progress">
                          <div style="width: ${percent}%"></div>
                        </div>

                        <small>${percent.toFixed(1)}% tổng chi tiêu</small>
                      </div>
                    `;
                  }).join('')
                : '<p>Chưa có danh mục chi tiêu.</p>'
            }
          </div>
        </div>
      </div>
    `;

    if (expenseChart) {
      expenseChart.destroy();
      expenseChart = null;
    }

    if (reportCategories.length > 0) {
      const canvas = document.querySelector('#expenseChart');

      expenseChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: reportCategories.map(item => item[0]),
          datasets: [{
            data: reportCategories.map(item => item[1]),
            backgroundColor: [
              '#3b82f6',
              '#10b981',
              '#f59e0b',
              '#ef4444',
              '#8b5cf6',
              '#06b6d4',
              '#ec4899'
            ],
            borderWidth: 3,
            borderColor: '#ffffff',
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 20,
                usePointStyle: true
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return context.label + ': ' +
                    formatMoney(context.raw);
                }
              }
            }
          }
        }
      });
    }

  } catch (error) {
    console.error('Lỗi tải thống kê:', error);
    content.innerHTML = `
      <div class="content-card">
        Không thể tải thống kê: ${error.message}
      </div>
    `;
  }
}

app.addEventListener('click', async event => {
    const editTransactionButton = event.target.closest('[data-edit-transaction]');

  if (editTransactionButton) {
    const id = editTransactionButton.dataset.editTransaction;

    const transaction = transactions.find(
    item => String(item.id) === String(id)
);

    if (transaction) {
      showEditTransactionForm(transaction);
    }

    return;
  }
  const pageButton = event.target.closest('[data-page]');

  if (pageButton) {
    showPage(pageButton.dataset.page);
    return;
  }

  
const deleteButton = event.target.closest('[data-delete]');

if (deleteButton) {
  const id = deleteButton.dataset.delete;

  if (confirm('Bạn có chắc muốn xóa giao dịch này?')) {
    try {
      await apiRequest(
        `/transactions/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );

      transactions = transactions.filter(
        item => String(item.id) !== String(id)
      );

      renderTransactions();
      alert('Đã xóa giao dịch thành công!');
    } catch (error) {
      console.error('Lỗi xóa giao dịch:', error);
      alert('Không thể xóa giao dịch: ' + error.message);
    }
  }

  return;
}


const editCategoryButton = event.target.closest('[data-edit-category]');

if (editCategoryButton) {
  const id = Number(editCategoryButton.dataset.editCategory);
  const category = categories.find(item => item.id === id);

  if (category) {
    showEditCategoryForm(category);
  }

  return;
}

 const deleteCategoryButton = event.target.closest('[data-delete-category]');

if (deleteCategoryButton) {
  const id = deleteCategoryButton.dataset.deleteCategory;

  if (confirm('Bạn có chắc muốn xóa danh mục này?')) {
    try {
      // Xóa danh mục trên Backend
      await apiRequest(
        `/categories/${encodeURIComponent(id)}`,
        {
          method: 'DELETE'
        }
      );

      // Tải lại danh mục từ Backend
      const result = await apiRequest('/categories');
      categories = result.data || [];

      renderCategories();

      alert('Đã xóa danh mục thành công!');

    } catch (error) {
      console.error('Lỗi xóa danh mục:', error);
      alert('Không thể xóa danh mục: ' + error.message);
    }
  }
}
  
const editBudgetButton = event.target.closest('[data-edit-budget]');

if (editBudgetButton) {
  const id = editBudgetButton.dataset.editBudget;

  const budget = budgets.find(
    item => String(item.id) === String(id)
  );

  if (!budget) {
    alert('Không tìm thấy ngân sách cần sửa!');
    return;
  }

  showBudgetForm(budget);
  return;
}


  
const deleteBudgetButton = event.target.closest('[data-delete-budget]');

if (deleteBudgetButton) {
  const id = deleteBudgetButton.dataset.deleteBudget;

  if (confirm('Bạn có chắc muốn xóa ngân sách này?')) {
    try {
      await apiRequest(
        `/budgets/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      );

      budgets = budgets.filter(
        item => String(item.id) !== String(id)
      );

      renderBudgets();

      alert('Đã xóa ngân sách thành công!');
    } catch (error) {
      console.error('Lỗi xóa ngân sách:', error);
      alert('Không thể xóa ngân sách: ' + error.message);
    }
  }

  return;
}


});

function renderDashboard() {
  const selectedMonth = dashboardMonth;

  const monthTransactions = transactions.filter(item =>
    item.date.startsWith(selectedMonth)
  );

  const totalIncome = monthTransactions
    .filter(item => item.type === 'income')
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const totalExpense = monthTransactions
    .filter(item => item.type === 'expense')
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const balance = totalIncome - totalExpense;

  // Thống kê chi tiêu theo danh mục
  const categoryTotals = {};

  monthTransactions
    .filter(item => item.type === 'expense')
    .forEach(item => {
      categoryTotals[item.category] =
        (categoryTotals[item.category] || 0) + Number(item.amount);
    });

  const categoryEntries = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1]);

  // 5 giao dịch gần đây
  const recentTransactions = [...monthTransactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 5);

  document.querySelector('#pageContent').innerHTML = `
    <div class="dashboard-heading">
      <div>
        <h2>Tổng quan</h2>
        <p>Theo dõi tình hình tài chính của bạn.</p>
      </div>

      <div class="month-picker">
        <span>📅</span>
        <input
          type="month"
          id="dashboardMonth"
          value="${selectedMonth}"
        >
      </div>
    </div>

    <div class="dashboard-cards">
      <div class="dashboard-card income-card">
        <div class="dashboard-card-top">
          <span>Tổng thu nhập</span>
          <div class="dashboard-icon income-icon">↗</div>
        </div>
        <h3>${formatMoney(totalIncome)}</h3>
        <small>Thu nhập trong tháng</small>
      </div>

      <div class="dashboard-card expense-card">
        <div class="dashboard-card-top">
          <span>Tổng chi tiêu</span>
          <div class="dashboard-icon expense-icon">↙</div>
        </div>
        <h3>${formatMoney(totalExpense)}</h3>
        <small>Chi tiêu trong tháng</small>
      </div>

      <div class="dashboard-card balance-card">
        <div class="dashboard-card-top">
          <span>Số dư</span>
          <div class="dashboard-icon balance-icon">₫</div>
        </div>
        <h3 class="${balance >= 0 ? 'income-text' : 'expense-text'}">
          ${formatMoney(balance)}
        </h3>
        <small>Thu nhập trừ chi tiêu</small>
      </div>

      <div class="dashboard-card count-card">
        <div class="dashboard-card-top">
          <span>Giao dịch</span>
          <div class="dashboard-icon count-icon">▤</div>
        </div>
        <h3>${monthTransactions.length}</h3>
        <small>Tổng giao dịch trong tháng</small>
      </div>
    </div>

    <div class="dashboard-content">
      <div class="dashboard-panel">
        <div class="panel-heading">
          <div>
            <h3>Chi tiêu theo danh mục</h3>
            <p>Phân bổ các khoản chi trong tháng</p>
          </div>
        </div>

        <div class="dashboard-chart-container">
          ${
            categoryEntries.length
              ? '<canvas id="dashboardExpenseChart"></canvas>'
              : '<div class="dashboard-empty">Chưa có dữ liệu chi tiêu trong tháng này.</div>'
          }
        </div>
      </div>

      <div class="dashboard-panel">
        <div class="panel-heading">
          <div>
            <h3>Giao dịch gần đây</h3>
            <p>5 giao dịch mới nhất trong tháng</p>
          </div>
          <button class="text-link" id="viewAllTransactions">
            Xem tất cả
          </button>
        </div>

        <div class="recent-transactions">
          ${
            recentTransactions.length
              ? recentTransactions.map(item => `
                <div class="recent-item">
                  <div class="recent-left">
                    <div class="recent-icon ${
                      item.type === 'income' ? 'recent-income' : 'recent-expense'
                    }">
                      ${item.type === 'income' ? '↗' : '↙'}
                    </div>

                    <div>
                      <strong>${item.name}</strong>
                      <p>${item.category} · ${formatDate(item.date)}</p>
                    </div>
                  </div>

                  <span class="${
                    item.type === 'income' ? 'income-text' : 'expense-text'
                  }">
                    ${item.type === 'income' ? '+' : '-'}${formatMoney(item.amount)}
                  </span>
                </div>
              `).join('')
              : '<div class="dashboard-empty">Chưa có giao dịch trong tháng này.</div>'
          }
        </div>
      </div>
    </div>
  `;

  // Chọn tháng
  document.querySelector('#dashboardMonth').addEventListener('change', event => {
    dashboardMonth = event.target.value;
    renderDashboard();
  });

  // Chuyển đến trang giao dịch
  document.querySelector('#viewAllTransactions').addEventListener('click', () => {
    showPage('transactions');
  });

  // Hủy biểu đồ cũ
  if (dashboardChart) {
    dashboardChart.destroy();
    dashboardChart = null;
  }

  // Vẽ biểu đồ mới
  if (categoryEntries.length) {
    const ctx = document.querySelector('#dashboardExpenseChart');

    dashboardChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categoryEntries.map(item => item[0]),
        datasets: [{
          data: categoryEntries.map(item => item[1]),
          backgroundColor: [
            '#3b82f6',
            '#10b981',
            '#f59e0b',
            '#8b5cf6',
            '#ec4899',
            '#06b6d4',
            '#f97316'
          ],
          borderWidth: 3,
          borderColor: '#ffffff',
          hoverOffset: 7
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 18,
              usePointStyle: true,
              pointStyle: 'circle',
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: context =>
                `${context.label}: ${formatMoney(context.raw)}`
            }
          }
        }
      }
    });
  }
}
window.getReportToken = async function() {
  return await auth.currentUser.getIdToken();
};