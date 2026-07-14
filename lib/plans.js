export const PLANS = {
    private: { id: "private", name: "Private Group", price: 10000, maxMembers: 3 },
    public: { id: "public", name: "Public Group", price: 15000, maxMembers: null }
}

export const DURATIONS = [
    { months: 1, label: "1 Bulan", discount: 0 },
    { months: 3, label: "3 Bulan", discount: 0.05 },
    { months: 6, label: "6 Bulan", discount: 0.1 },
    { months: 12, label: "1 Tahun", discount: 0.2 }
]

export default { PLANS, DURATIONS }
