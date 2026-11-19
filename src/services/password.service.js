function generatePassword(length = 8) {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

  const all = upper + lower + digits + symbols;

  const getRandom = (str) => str[Math.floor(Math.random() * str.length)];

  let password = [
    getRandom(upper),
    getRandom(lower),
    getRandom(digits),
    getRandom(symbols),
  ];

  for (let i = password.length; i < length; i++) {
    password.push(getRandom(all));
  }

  password = password.sort(() => 0.5 - Math.random()).join("");

  return password;
}

module.exports = generatePassword;
