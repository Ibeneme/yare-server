const Pricing = require("../models/Pricing");
const { CURRENCIES } = require("../config/constants");

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const validatePrices = (prices) => {
  if (!prices) throw bad("prices { NGN, USD } is required");
  for (const c of CURRENCIES) {
    const v = Number(prices[c]);
    if (!Number.isFinite(v) || v < 0)
      throw bad(`prices.${c} must be a number >= 0`);
  }
  return { NGN: Number(prices.NGN), USD: Number(prices.USD) };
};

const normalizeKind = (rawKind) => {
  if (!rawKind || rawKind === "product" || rawKind === "subscription") {
    return "subscription";
  }
  return rawKind;
};

const DEFAULT_SUBSCRIPTION_PLANS = [
  {
    planKey: "1-month",
    kind: "subscription",
    name: "1 Month",
    description:
      "30 days access · Per student · Full live classes, Digital workbooks & quizzes, Parent progress dashboard, WAEC/JAMB/BECE prep, 24/7 lesson recordings",
    durationDays: 30,
    prices: { NGN: 50000, USD: 35 },
    isActive: true,
    meta: {
      badge: null,
      billingLabel: "30 days access",
      perUnitLabel: "per student",
      compareAtNGN: null,
      savingsNGN: null,
      features: [
        "Full live classes",
        "Digital workbooks & quizzes",
        "Parent progress dashboard",
        "WAEC/JAMB/BECE prep",
        "24/7 lesson recordings",
      ],
    },
  },
  {
    planKey: "3-months",
    kind: "subscription",
    name: "3 Months",
    description:
      "90 days access · Per student · Save ₦4,950 (from ₦150,000) · Everything in 1 Month, Free 1-on-1 teacher consultation, Priority exam revision pack, Study group leadership role, Bonus learning games",
    durationDays: 90,
    prices: { NGN: 145050, USD: 100 },
    isActive: true,
    meta: {
      badge: "MOST POPULAR",
      billingLabel: "90 days access",
      perUnitLabel: "per student",
      compareAtNGN: 150000,
      savingsNGN: 4950,
      features: [
        "Everything in 1 Month",
        "Free 1-on-1 teacher consultation",
        "Priority exam revision pack",
        "Study group leadership role",
        "Bonus learning games",
      ],
    },
  },
  {
    planKey: "6-months",
    kind: "subscription",
    name: "6 Months",
    description:
      "180 days access · Per student · Save ₦20,100 (from ₦300,000) · Everything in 3 Months, Free printed revision booklet (Lagos only), Monthly parent-teacher call, Early access to new subjects, Certificate of Excellence",
    durationDays: 180,
    prices: { NGN: 279900, USD: 190 },
    isActive: true,
    meta: {
      badge: null,
      billingLabel: "180 days access",
      perUnitLabel: "per student",
      compareAtNGN: 300000,
      savingsNGN: 20100,
      features: [
        "Everything in 3 Months",
        "Free printed revision booklet (Lagos only)",
        "Monthly parent-teacher call",
        "Early access to new subjects",
        "Certificate of Excellence",
      ],
    },
  },
];

const ensureDefaultSubscriptionPlans = async (userId = null) => {
  await Promise.all(
    DEFAULT_SUBSCRIPTION_PLANS.map((plan) =>
      Pricing.findOneAndUpdate(
        { kind: "subscription", planKey: plan.planKey },
        {
          $setOnInsert: {
            kind: "subscription",
            planKey: plan.planKey,
            name: plan.name,
            description: plan.description,
            durationDays: plan.durationDays,
            prices: plan.prices,
            isActive: plan.isActive,
            meta: plan.meta,
            ...(userId ? { updatedBy: userId } : {}),
          },
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      ),
    ),
  );
};

const list = async (req, res) => {
  const filter = {};
  if (req.query.kind) filter.kind = normalizeKind(req.query.kind);

  // Auto-create the default 1M / 3M / 6M subscription plans if none exist yet
  const existingSubscriptionsCount = await Pricing.countDocuments({
    kind: "subscription",
  });
  if (existingSubscriptionsCount === 0) {
    await ensureDefaultSubscriptionPlans(req.user?.id || null);
  }

  // Public listing only shows active rows; admins can ask for everything.
  const isAdmin =
    req.user?.userType === "admin" || req.user?.userType === "superadmin";
  if (!isAdmin || req.query.active === "true") filter.isActive = true;

  const data = await Pricing.find(filter)
    .sort({ durationDays: 1, name: 1 })
    .lean();
  res.json({ success: true, data });
};

const seedDefaults = async (req, res) => {
  const forceReset = Boolean(req.body?.force);
  if (forceReset) {
    await Promise.all(
      DEFAULT_SUBSCRIPTION_PLANS.map((plan) =>
        Pricing.findOneAndUpdate(
          { kind: "subscription", planKey: plan.planKey },
          {
            $set: {
              kind: "subscription",
              planKey: plan.planKey,
              name: plan.name,
              description: plan.description,
              durationDays: plan.durationDays,
              prices: plan.prices,
              isActive: plan.isActive,
              meta: plan.meta,
              updatedBy: req.user?.id || null,
            },
            $unset: { refId: "" },
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        ),
      ),
    );
  } else {
    await ensureDefaultSubscriptionPlans(req.user?.id || null);
  }

  const data = await Pricing.find({ kind: "subscription" })
    .sort({ durationDays: 1, name: 1 })
    .lean();
  res.status(201).json({ success: true, data });
};

const upsert = async (req, res) => {
  const kind = normalizeKind(req.body.kind);
  if (kind !== "subscription") {
    throw bad(
      "Pricing is configured for product subscriptions only (not grade or subject)",
    );
  }

  const prices = validatePrices(req.body.prices);
  const resolvedName =
    (typeof req.body.name === "string" && req.body.name.trim()) ||
    "Product Subscription";
  const resolvedKey =
    (typeof req.body.planKey === "string" && req.body.planKey.trim()) ||
    (typeof req.body.key === "string" && req.body.key.trim()) ||
    resolvedName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") ||
    "default";

  const update = {
    kind: "subscription",
    planKey: resolvedKey,
    name: resolvedName,
    description: req.body.description ?? "",
    prices,
    updatedBy: req.user.id,
  };

  if (req.body.meta && typeof req.body.meta === "object") {
    update.meta = req.body.meta;
  }
  if (req.body.durationDays !== undefined && req.body.durationDays !== "") {
    const days = Number(req.body.durationDays);
    if (!Number.isFinite(days) || days <= 0) {
      throw bad("durationDays must be a positive number");
    }
    update.durationDays = days;
  }
  if (typeof req.body.isActive === "boolean") {
    update.isActive = req.body.isActive;
  }

  const query = req.body._id
    ? { _id: req.body._id }
    : { kind: "subscription", planKey: resolvedKey };

  const doc = await Pricing.findOneAndUpdate(
    query,
    { $set: update, $unset: { refId: "" } },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  res.status(201).json({ success: true, data: doc });
};

const update = async (req, res) => {
  const patch = {};
  [
    "name",
    "planKey",
    "description",
    "durationDays",
    "isActive",
    "meta",
  ].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  if (patch.durationDays !== undefined) {
    const days = Number(patch.durationDays);
    if (!Number.isFinite(days) || days <= 0) {
      throw bad("durationDays must be a positive number");
    }
    patch.durationDays = days;
  }
  if (req.body.prices) patch.prices = validatePrices(req.body.prices);
  patch.updatedBy = req.user.id;

  const doc = await Pricing.findByIdAndUpdate(req.params.id, patch, {
    new: true,
    runValidators: true,
  });
  if (!doc) throw bad("Price not found", 404);
  res.json({ success: true, data: doc });
};

const remove = async (req, res) => {
  const doc = await Pricing.findByIdAndDelete(req.params.id);
  if (!doc) throw bad("Price not found", 404);
  res.json({ success: true, message: "Price removed" });
};

module.exports = {
  list,
  seedDefaults,
  upsert,
  update,
  remove,
  DEFAULT_SUBSCRIPTION_PLANS,
  ensureDefaultSubscriptionPlans,
};
