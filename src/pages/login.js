export function renderLogin() {
  return `
    <div class="auth-container">
      <form class="auth-card" id="loginForm">
        <h1>Quản Lý Chi Tiêu</h1>
        <p>Đăng nhập để quản lý chi tiêu của bạn</p>

        <label>Email</label>
        <input
        type="email"
        name="email"
        placeholder="Nhập email"
        autocomplete="off"
        value=""
        required
        >

        <label>Mật khẩu</label>
        <input
        type="password"
        name="password"
        placeholder="Nhập mật khẩu"
        autocomplete="new-password"
        required
    >

        <p class="auth-error" id="loginError"></p>

        <button type="submit" class="primary-btn">
          Đăng nhập
        </button>

        <p class="auth-switch">
          Chưa có tài khoản?
          <a href="#" id="showRegister">Đăng ký ngay</a>
        </p>
      </form>
    </div>
  `;
}