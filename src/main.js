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
async function uploadReceipt(file, transactionId) {
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

  const fileName = `${transactionId}_${Date.now()}`;
  const receiptPath =
    `users/${currentUserId}/receipts/${fileName}`;

  const receiptRef = ref(storage, receiptPath);

  await uploadBytes(receiptRef, file);

  const receiptUrl = await getDownloadURL(receiptRef);

  return {
    receiptUrl,
    receiptPath
  };
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

const cloudCollections = ['transactions', 'categories', 'budgets'];

async function loadCloudData(userId) {
  currentUserId = userId;
  const userCollection = name => collection(db, 'users', userId, name);

  const [transactionSnapshot, categorySnapshot, budgetSnapshot] = await Promise.all([
    getDocs(userCollection('transactions')),
    getDocs(userCollection('categories')),
    getDocs(userCollection('budgets'))
  ]);

  const hasCloudData = !transactionSnapshot.empty || !categorySnapshot.empty || !budgetSnapshot.empty;

  if (hasCloudData) {
    transactions = transactionSnapshot.docs.map(item => item.data());
    categories = categorySnapshot.empty ? [] : categorySnapshot.docs.map(item => item.data());
    budgets = budgetSnapshot.empty ? [] : budgetSnapshot.docs.map(item => item.data());
  } else {
    // Tài khoản mới bắt đầu với danh mục mặc định; giao dịch và ngân sách để trống.
    transactions = [];
    categories = defaultCategories.map(item => ({ ...item }));
    budgets = [];
    isCloudDataReady = true;
    await saveData();
  }

  // Cập nhật bản sao trên trình duyệt của tài khoản đang đăng nhập.
  localStorage.setItem('QLCT_transactions', JSON.stringify(transactions));
  localStorage.setItem('QLCT_categories', JSON.stringify(categories));
  localStorage.setItem('QLCT_budgets', JSON.stringify(budgets));
  isCloudDataReady = true;
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
                    <td>
                    ${
                    item.receiptUrl
                    ? `<a href="${item.receiptUrl}" target="_blank" rel="noopener noreferrer">Xem ảnh</a>`
                    : 'Chưa có'
                  }
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
      <option value="${item.name}">${item.name}</option>
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

  const formData = new FormData(event.target);
  const file = formData.get('receipt');

  if (!formData.get('category')) {
    alert('Vui lòng tạo danh mục trước khi thêm giao dịch!');
    return;
  }

  const transactionId = Date.now();

  try {
    let receiptData = null;

    // Nếu có chọn ảnh thì tải lên Storage
    if (file && file.size > 0) {
      receiptData = await uploadReceipt(file, transactionId);
    }

    transactions.unshift({
      id: transactionId,
      name: formData.get('name').trim(),
      category: formData.get('category'),
      amount: parseMoney(formData.get('amount')),
      date: formData.get('date'),
      type: formData.get('type'),
      receiptUrl: receiptData?.receiptUrl || null,
      receiptPath: receiptData?.receiptPath || null
    });

    await saveData();
    renderTransactions();

  } catch (error) {
    console.error('Lỗi lưu giao dịch:', error);
    alert(error.message || 'Không thể tải ảnh hóa đơn lên!');
  }
});
}

function showEditTransactionForm(transaction) {
  const content = document.querySelector('#pageContent');

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

setupMoneyInput(amountInput);

  function updateCategoryOptions() {
    const availableCategories = categories.filter(
      item => item.type === typeSelect.value
    );

    categorySelect.innerHTML = availableCategories.map(item => `
      <option
        value="${item.name}"
        ${item.name === transaction.category ? 'selected' : ''}
      >
        ${item.name}
      </option>
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

  document.querySelector('#transactionForm').addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(event.target);

    if (!formData.get('category')) {
      alert('Vui lòng chọn danh mục!');
      return;
    }

    transactions = transactions.map(item =>
      item.id === transaction.id
        ? {
            ...item,
            name: formData.get('name').trim(),
            category: formData.get('category'),
            amount: parseMoney(formData.get('amount')),
            date: formData.get('date'),
            type: formData.get('type')
          }
        : item
    );

    saveData();
    renderTransactions();
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

  handleCategoryForm();
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
function handleCategoryForm(category = null) {
  const isEditing = category !== null;

  document.querySelector('#cancelCategoryBtn').addEventListener('click', () => {
    document.querySelector('#categoryModal').remove();
  });

  document.querySelector('#categoryForm').addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(event.target);
    const name = formData.get('name').trim();
    const type = formData.get('type');

    const duplicate = categories.some(item =>
      item.name.toLowerCase() === name.toLowerCase() &&
      item.type === type &&
      item.id !== (isEditing ? category.id : null)
    );

    if (duplicate) {
      alert('Danh mục này đã tồn tại!');
      return;
    }

    if (isEditing) {
      categories = categories.map(item =>
        item.id === category.id
          ? { ...item, name, type }
          : item
      );
    } else {
      categories.push({
        id: Date.now(),
        name,
        type
      });
    }

    saveData();
    renderCategories();
  });
} 


function renderBudgets() {
  const content = document.querySelector('#pageContent');

  // Tự động tính số tiền đã chi theo từng danh mục
  const budgetData = budgets.map(item => {
    const spent = transactions
      .filter(transaction =>
        transaction.type === 'expense' &&
        transaction.category === item.category
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

    return {
      ...item,
      spent
    };
  });

  const totalLimit = budgetData.reduce((sum, item) => sum + Number(item.limit), 0);
  const totalSpent = budgetData.reduce((sum, item) => sum + item.spent, 0);
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
                    <h3>${item.category}</h3>
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
  console.table(categories);
  const isEditing = budget !== null;

  const availableCategories = categories.filter(category =>
    category.type === 'expense' &&
    (
      isEditing
        ? true
        : !budgets.some(item => item.category === category.name)
    )
  );

  if (!isEditing && availableCategories.length === 0) {
    alert('Không còn danh mục chi tiêu phù hợp để tạo ngân sách.');
    return;
  }

  const categoryOptions = availableCategories.map(category => `
    <option
      value="${category.name}"
      ${isEditing && budget.category === category.name ? 'selected' : ''}
    >
      ${category.name}
    </option>
  `).join('');

  document.querySelector('#pageContent').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="budgetModal">
      <form class="transaction-form" id="budgetForm">
        <h3>${isEditing ? 'Sửa ngân sách' : 'Thêm ngân sách'}</h3>

        <label>Danh mục chi tiêu</label>
        <select name="category" required>
          ${categoryOptions}
        </select>

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

  document.querySelector('#budgetForm').addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(event.target);
    const category = formData.get('category');
    const limit = parseMoney(formData.get('limit'));  

    if (budgets.some(item =>
      item.category === category &&
      item.id !== (isEditing ? budget.id : null)
    )) {
      alert('Danh mục này đã có ngân sách!');
      return;
    }

    if (isEditing) {
      budgets = budgets.map(item =>
        item.id === budget.id
          ? { ...item, category, limit }
          : item
      );
    } else {
      budgets.push({
        id: Date.now(),
        category,
        limit,
        spent: 0
      });
    }
    saveData();
    renderBudgets();
  });
}

function renderReports() {
  const content = document.querySelector('#pageContent');

  const income = transactions
    .filter(item => item.type === 'income')
    .reduce((sum, item) => sum + item.amount, 0);

  const expense = transactions
    .filter(item => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0);

  const balance = income - expense;

  // Tổng hợp chi tiêu theo danh mục
  const categoryTotals = {};

  transactions
    .filter(item => item.type === 'expense')
    .forEach(item => {
      categoryTotals[item.category] =
        (categoryTotals[item.category] || 0) + item.amount;
    });

  const reportCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1]);

  content.innerHTML = `
    <div class="page-heading">
      <div>
        <h2>Thống kê</h2>
        <p>Tổng quan tình hình thu nhập và chi tiêu của bạn.</p>
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
        <p class="report-subtitle">Các khoản chi được sắp xếp từ cao xuống thấp.</p>

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

  // Hủy biểu đồ cũ trước khi tạo biểu đồ mới
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
}

app.addEventListener('click', event => {
    const editTransactionButton = event.target.closest('[data-edit-transaction]');

  if (editTransactionButton) {
    const id = Number(editTransactionButton.dataset.editTransaction);

    const transaction = transactions.find(item => item.id === id);

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
    const id = Number(deleteButton.dataset.delete);

    if (confirm('Bạn có chắc muốn xóa giao dịch này?')) {
      transactions = transactions.filter(item => item.id !== id);
      saveData();
      renderTransactions();
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
    const id = Number(deleteCategoryButton.dataset.deleteCategory);

    if (confirm('Bạn có chắc muốn xóa danh mục này?')) {
      categories = categories.filter(item => item.id !== id);
      saveData();
      renderCategories();
    }
  }
  
  const editBudgetButton = event.target.closest('[data-edit-budget]');

  if (editBudgetButton) {
    const id = Number(editBudgetButton.dataset.editBudget);
    const budget = budgets.find(item => item.id === id);

    showBudgetForm(budget);
    return;
  }

  const deleteBudgetButton = event.target.closest('[data-delete-budget]');

  if (deleteBudgetButton) {
    const id = Number(deleteBudgetButton.dataset.deleteBudget);

    if (confirm('Bạn có chắc muốn xóa ngân sách này?')) {
      budgets = budgets.filter(item => item.id !== id);
      saveData();
      renderBudgets();
    }
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