
export function renderRegister() {
  return `
    <div class="auth-container">
      <form class="auth-card" id="registerForm">
        <h1>Quản Lý Chi Tiêu</h1>
        <p>Tạo tài khoản để bắt đầu quản lý chi tiêu</p>

        <label>Họ và tên</label>
        <input
          type="text"
          name="name"
          placeholder="Nhập họ và tên"
          required
        >

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

        <label>Xác nhận mật khẩu</label>
        <input
          type="password"
          name="confirmPassword"
          placeholder="Nhập lại mật khẩu"
          required
        >

        <p class="auth-error" id="registerError"></p>

        <button type="submit" class="primary-btn">
          Đăng ký
        </button>

        <p class="auth-switch">
          Đã có tài khoản?
          <a href="#" id="showLogin">Đăng nhập</a>
        </p>
      </form>
    </div>
  `;
}
