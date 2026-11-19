const Transaction = require("../models/Transaction");

const populate = [
  { path: "parentId", select: "firstName lastName email" },
  { path: "studentIds", select: "firstName lastName" },
];

/** Parent: their own transactions. */
const myTransactions = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = { parentId: req.user.id };
  if (status) filter.status = status;
  const [data, total] = await Promise.all([
    Transaction.find(filter)
      .select("-gatewayResponse")
      .populate("studentIds", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(),
    Transaction.countDocuments(filter),
  ]);
  res.json({ success: true, data, total, page: Number(page) });
};

/** Admin: every transaction, with filters and revenue totals per currency. */
const allTransactions = async (req, res) => {
  const { status, currency, parentId, from, to, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (currency) filter.currency = currency.toUpperCase();
  if (parentId) filter.parentId = parentId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const [data, total, revenue] = await Promise.all([
    Transaction.find(filter)
      .select("-gatewayResponse")
      .populate(populate)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(),
    Transaction.countDocuments(filter),
    Transaction.aggregate([
      { $match: { ...filter, status: "success" } },
      { $group: { _id: "$currency", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    success: true,
    data,
    total,
    page: Number(page),
    revenue: Object.fromEntries(revenue.map((r) => [r._id, { total: r.total, count: r.count }])),
  });
};

const getTransaction = async (req, res) => {
  const tx = await Transaction.findById(req.params.id).populate(populate).lean();
  if (!tx) return res.status(404).json({ success: false, message: "Not found" });
  const isAdmin = req.user.userType === "admin";
  if (!isAdmin && String(tx.parentId?._id) !== String(req.user.id)) {
    return res.status(403).json({ success: false, message: "Not allowed" });
  }
  res.json({ success: true, data: tx });
};

module.exports = { myTransactions, allTransactions, getTransaction };
