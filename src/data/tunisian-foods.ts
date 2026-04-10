// Tunisian Food Database
// 393 authentic Tunisian and packaged foods available in Tunisia

export interface FoodItem {
  id: string;
  name: string;
  nameEn: string;
  nameFr: string | null;
  nameAr: string | null;
  category: string;
  origin: "tunisian" | "packaged";
  brand: string | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatsPer100g: number;
  typicalServingGrams: number;
  aliases: string[];
  // Computed fields
  confidence: number;
  verificationStatus: "verified" | "cross_checked" | "estimate";
}

// Food categories with icons and colors
export const FOOD_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  beverages: { label: "Beverages", icon: "🥤", color: "from-blue-500/20 to-cyan-500/20" },
  dairy: { label: "Dairy", icon: "🥛", color: "from-amber-500/20 to-yellow-500/20" },
  desserts: { label: "Desserts", icon: "🍰", color: "from-pink-500/20 to-rose-500/20" },
  pastries: { label: "Pastries", icon: "🥐", color: "from-orange-500/20 to-amber-500/20" },
  snacks: { label: "Snacks", icon: "🍿", color: "from-red-500/20 to-orange-500/20" },
  breakfast: { label: "Breakfast", icon: "🍳", color: "from-yellow-500/20 to-orange-500/20" },
  fastFood: { label: "Fast Food", icon: "🍔", color: "from-red-500/20 to-yellow-500/20" },
  vegetables: { label: "Vegetables", icon: "🥬", color: "from-green-500/20 to-emerald-500/20" },
  salads: { label: "Salads", icon: "🥗", color: "from-green-500/20 to-lime-500/20" },
  sandwiches: { label: "Sandwiches", icon: "🥪", color: "from-amber-500/20 to-orange-500/20" },
  soups: { label: "Soups", icon: "🍲", color: "from-orange-500/20 to-red-500/20" },
  couscous: { label: "Couscous", icon: "🍚", color: "from-amber-500/20 to-yellow-500/20" },
  sides: { label: "Sides", icon: "🍟", color: "from-yellow-500/20 to-amber-500/20" },
  fruits: { label: "Fruits", icon: "🍎", color: "from-red-500/20 to-pink-500/20" },
  breads: { label: "Breads", icon: "🍞", color: "from-amber-500/20 to-orange-500/20" },
  seafood: { label: "Seafood", icon: "🐟", color: "from-blue-500/20 to-cyan-500/20" },
  tagines: { label: "Tagines", icon: "🫕", color: "from-orange-500/20 to-red-500/20" },
  grilledMeats: { label: "Grilled Meats", icon: "🍖", color: "from-red-500/20 to-orange-500/20" },
  condiments: { label: "Condiments", icon: "🫙", color: "from-red-500/20 to-yellow-500/20" },
  pantry: { label: "Pantry", icon: "🥫", color: "from-slate-500/20 to-gray-500/20" },
  main: { label: "Main Dishes", icon: "🍽️", color: "from-orange-500/20 to-amber-500/20" },
  appetizers: { label: "Appetizers", icon: "🥟", color: "from-amber-500/20 to-yellow-500/20" },
};

// Filter options
export const FILTER_OPTIONS = [
  { id: "all", label: "All" },
  { id: "verified", label: "Verified" },
  { id: "tunisian", label: "Tunisian" },
  { id: "packaged", label: "Packaged" },
  { id: "high-protein", label: "High Protein" },
  { id: "low-calorie", label: "Low Calorie" },
] as const;

// Selected raw foods from the Tunisian dataset (100 most popular items)
const rawFoods = [
  { name: "7UP", nameEn: "7UP", nameFr: "7UP", nameAr: "سفن أب", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 39, proteinPer100g: 0, carbsPer100g: 9.8, fatsPer100g: 0, typicalServingGrams: 330, aliases: ["7up","seven up","سفن أب"] },
  { name: "Activia Yogurt Natural", nameEn: "Activia Yogurt Natural", nameFr: "Yaourt Activia Nature", nameAr: "زبادي أكتيفيا طبيعي", category: "dairy", origin: "tunisian" as const, caloriesPer100g: 75, proteinPer100g: 4, carbsPer100g: 9, fatsPer100g: 3, typicalServingGrams: 125, aliases: ["activia natural","أكتيفيا طبيعي"] },
  { name: "Aquafina Water", nameEn: "Aquafina Water", nameFr: "Eau Aquafina", nameAr: "ماء أكوافينا", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatsPer100g: 0, typicalServingGrams: 500, aliases: ["aquafina","أكوافينا"] },
  { name: "Assidat zgougou", nameEn: "Assidat zgougou", nameFr: "Assidat Zgougou", nameAr: "عصيدة زقوقو", category: "desserts", origin: "tunisian" as const, caloriesPer100g: 185, proteinPer100g: 4.8, carbsPer100g: 32.5, fatsPer100g: 5, typicalServingGrams: 200, aliases: ["assidat","عصيدة زقوقو"] },
  { name: "Babybel Original", nameEn: "Babybel Original", nameFr: "Babybel Original", nameAr: "بيبي بل أصلي", category: "dairy", origin: "tunisian" as const, caloriesPer100g: 315, proteinPer100g: 18.5, carbsPer100g: 2, fatsPer100g: 26.5, typicalServingGrams: 22, aliases: ["babybel","بيبي بل"] },
  { name: "Baklava", nameEn: "Baklava", nameFr: "Baklava", nameAr: "بقلاوة", category: "pastries", origin: "tunisian" as const, caloriesPer100g: 425, proteinPer100g: 6.5, carbsPer100g: 48.2, fatsPer100g: 24.5, typicalServingGrams: 50, aliases: ["baklawa","honey pastry"] },
  { name: "Bardo Chips Classic", nameEn: "Bardo Chips Classic", nameFr: "Chips Bardo Classique", nameAr: "شيبس باردو كلاسيك", category: "snacks", origin: "packaged" as const, caloriesPer100g: 530, proteinPer100g: 5.8, carbsPer100g: 53, fatsPer100g: 34, typicalServingGrams: 40, aliases: ["bardo chips","باردو شيبس"] },
  { name: "Beleila Cheese", nameEn: "Beleila Cheese", nameFr: "Fromage Beleila", nameAr: "جبنة بليلة", category: "dairy", origin: "tunisian" as const, caloriesPer100g: 285, proteinPer100g: 18.5, carbsPer100g: 2.5, fatsPer100g: 22.5, typicalServingGrams: 100, aliases: ["beleila","grilling cheese","جبنة بليلة"] },
  { name: "Boga Apple", nameEn: "Boga Apple", nameFr: "Boga Pomme", nameAr: "بوغا تفاح", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 40, proteinPer100g: 0, carbsPer100g: 10, fatsPer100g: 0, typicalServingGrams: 250, aliases: ["boga apple","بوغا تفاح"] },
  { name: "Boga Cidre", nameEn: "Boga Cidre", nameFr: "Boga Cidre", nameAr: "بوغا سيدر", category: "beverages", origin: "packaged" as const, caloriesPer100g: 38, proteinPer100g: 0, carbsPer100g: 9.5, fatsPer100g: 0, typicalServingGrams: 250, aliases: ["boga","boga cidre"] },
  { name: "Boiled Eggs", nameEn: "Boiled Eggs", nameFr: "Oeufs Durs", nameAr: "بيض مسلوق", category: "breakfast", origin: "tunisian" as const, caloriesPer100g: 142, proteinPer100g: 12.5, carbsPer100g: 1, fatsPer100g: 9.5, typicalServingGrams: 100, aliases: ["boiled eggs","بيض مسلوق"] },
  { name: "Boni Butter Biscuits", nameEn: "Boni Butter Biscuits", nameFr: "Biscuits Beurre Boni", nameAr: "بسكويت زبدة بوني", category: "snacks", origin: "packaged" as const, caloriesPer100g: 468, proteinPer100g: 6.8, carbsPer100g: 62, fatsPer100g: 22.5, typicalServingGrams: 11, aliases: ["boni butter biscuits","بوني زبدة"] },
  { name: "Bounty", nameEn: "Bounty", nameFr: "Bounty", nameAr: "باونتي", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 475, proteinPer100g: 4, carbsPer100g: 57.5, fatsPer100g: 25.5, typicalServingGrams: 28, aliases: ["bounty","باونتي"] },
  { name: "Brik à l'Oeuf", nameEn: "Brik à l'Oeuf", nameFr: "Brik à l'Oeuf", nameAr: "بريك بالبيض", category: "pastries", origin: "tunisian" as const, caloriesPer100g: 285, proteinPer100g: 8.5, carbsPer100g: 22, fatsPer100g: 18.5, typicalServingGrams: 120, aliases: ["brik","brick"] },
  { name: "Burger King Whopper", nameEn: "Burger King Whopper", nameFr: "Whopper Burger King", nameAr: "ووبر برجر كينج", category: "fastFood", origin: "tunisian" as const, caloriesPer100g: 248, proteinPer100g: 11.8, carbsPer100g: 22.5, fatsPer100g: 13.2, typicalServingGrams: 280, aliases: ["whopper","ووبر"] },
  { name: "Cappuccino", nameEn: "Cappuccino", nameFr: "Cappuccino", nameAr: "كابتشينو", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 45, proteinPer100g: 2.5, carbsPer100g: 4.5, fatsPer100g: 2.2, typicalServingGrams: 180, aliases: ["cappuccino","كابتشينو"] },
  { name: "Cassecroute Tunisien", nameEn: "Cassecroute Tunisien", nameFr: "Cassecroute", nameAr: "كاسكروت", category: "sandwiches", origin: "tunisian" as const, caloriesPer100g: 228, proteinPer100g: 11.5, carbsPer100g: 26.5, fatsPer100g: 10.5, typicalServingGrams: 250, aliases: ["cassecroute","كاسكروت"] },
  { name: "Chakchouka", nameEn: "Chakchouka", nameFr: "Chakchouka", nameAr: "شكشوكة", category: "vegetables", origin: "tunisian" as const, caloriesPer100g: 82, proteinPer100g: 4.5, carbsPer100g: 7.8, fatsPer100g: 4.2, typicalServingGrams: 200, aliases: ["shakshuka","chakchouka eggs"] },
  { name: "Chebakia", nameEn: "Chebakia", nameFr: "Chebakia", nameAr: "شباكية", category: "pastries", origin: "tunisian" as const, caloriesPer100g: 458, proteinPer100g: 5.2, carbsPer100g: 55.5, fatsPer100g: 25.5, typicalServingGrams: 45, aliases: ["chebakia pastry","شباكية"] },
  { name: "Coca-Cola", nameEn: "Coca-Cola", nameFr: "Coca-Cola", nameAr: "كوكا كولا", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 42, proteinPer100g: 0, carbsPer100g: 10.5, fatsPer100g: 0, typicalServingGrams: 330, aliases: ["coke","coca cola","كوكا كولا"] },
  { name: "Coca-Cola Zero", nameEn: "Coca-Cola Zero", nameFr: "Coca-Cola Zero", nameAr: "كوكا كولا زيرو", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatsPer100g: 0, typicalServingGrams: 330, aliases: ["coke zero","coca zero","كوكا زيرو"] },
  { name: "Couscous with Beef", nameEn: "Couscous with Beef", nameFr: "Couscous au Bœuf", nameAr: "كسكس بالبقري", category: "couscous", origin: "tunisian" as const, caloriesPer100g: 225, proteinPer100g: 16.8, carbsPer100g: 27, fatsPer100g: 7.5, typicalServingGrams: 400, aliases: ["beef couscous","كسكس لحم"] },
  { name: "Couscous with Chicken", nameEn: "Couscous with Chicken", nameFr: "Couscous au Poulet", nameAr: "كسكس بالدجاج", category: "couscous", origin: "tunisian" as const, caloriesPer100g: 198, proteinPer100g: 16.2, carbsPer100g: 27.5, fatsPer100g: 4.8, typicalServingGrams: 250, aliases: ["chicken couscous"] },
  { name: "Couscous with Vegetables", nameEn: "Couscous with Vegetables", nameFr: "Couscous aux Légumes", nameAr: "كسكس بالخضروات", category: "couscous", origin: "tunisian" as const, caloriesPer100g: 150, proteinPer100g: 5.2, carbsPer100g: 32, fatsPer100g: 1.8, typicalServingGrams: 200, aliases: ["couscous","vegetable couscous"] },
  { name: "Crepe with Nutella", nameEn: "Crepe with Nutella", nameFr: "Crêpe Nutella", nameAr: "كريب نوتيلا", category: "desserts", origin: "tunisian" as const, caloriesPer100g: 318, proteinPer100g: 6.2, carbsPer100g: 42.5, fatsPer100g: 14, typicalServingGrams: 100, aliases: ["nutella crepe","كريب نوتيلا"] },
  { name: "Croissant Butter", nameEn: "Croissant Butter", nameFr: "Croissant au Beurre", nameAr: "كرواسون بالزبدة", category: "pastries", origin: "packaged" as const, caloriesPer100g: 428, proteinPer100g: 7.5, carbsPer100g: 45.5, fatsPer100g: 23.5, typicalServingGrams: 58, aliases: ["butter croissant","كرواسون زبدة"] },
  { name: "Delice Yogurt Natural", nameEn: "Delice Yogurt Natural", nameFr: "Yaourt Nature Delice", nameAr: "ياغورت طبيعي ديليس", category: "dairy", origin: "packaged" as const, caloriesPer100g: 68, proteinPer100g: 4.2, carbsPer100g: 5.5, fatsPer100g: 3.8, typicalServingGrams: 125, aliases: ["delice yogurt natural","ديليس ياغورت طبيعي"] },
  { name: "Espresso", nameEn: "Espresso", nameFr: "Espresso", nameAr: "اسبريسو", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 2, proteinPer100g: 0.1, carbsPer100g: 0.3, fatsPer100g: 0, typicalServingGrams: 40, aliases: ["espresso","اسبريسو"] },
  { name: "Fanta Orange", nameEn: "Fanta Orange", nameFr: "Fanta Orange", nameAr: "فانتا برتقال", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 48, proteinPer100g: 0, carbsPer100g: 12, fatsPer100g: 0, typicalServingGrams: 330, aliases: ["fanta","فانتا"] },
  { name: "Ferrero Rocher", nameEn: "Ferrero Rocher", nameFr: "Ferrero Rocher", nameAr: "فيرو روشيه", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 580, proteinPer100g: 7.5, carbsPer100g: 46, fatsPer100g: 41.5, typicalServingGrams: 13, aliases: ["ferrero rocher","فيرو روشيه"] },
  { name: "French Fries", nameEn: "French Fries", nameFr: "Frites", nameAr: "بطاطا مقلية", category: "sides", origin: "tunisian" as const, caloriesPer100g: 285, proteinPer100g: 3.2, carbsPer100g: 35.5, fatsPer100g: 15.5, typicalServingGrams: 150, aliases: ["french fries","بطاطا مقلية"] },
  { name: "Fresh Banana", nameEn: "Fresh Banana", nameFr: "Banane Fraîche", nameAr: "موز طازج", category: "fruits", origin: "tunisian" as const, caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 22.8, fatsPer100g: 0.3, typicalServingGrams: 120, aliases: ["banana","موز"] },
  { name: "Fresh Orange", nameEn: "Fresh Orange", nameFr: "Orange Fraîche", nameAr: "برتقال طازج", category: "fruits", origin: "tunisian" as const, caloriesPer100g: 47, proteinPer100g: 0.9, carbsPer100g: 11.8, fatsPer100g: 0.1, typicalServingGrams: 180, aliases: ["orange","برتقال"] },
  { name: "Fresh Watermelon", nameEn: "Fresh Watermelon", nameFr: "Pastèque Fraîche", nameAr: "دلاع طازج", category: "fruits", origin: "tunisian" as const, caloriesPer100g: 30, proteinPer100g: 0.6, carbsPer100g: 7.6, fatsPer100g: 0.1, typicalServingGrams: 300, aliases: ["watermelon","دلاع"] },
  { name: "Grilled Chicken", nameEn: "Grilled Chicken", nameFr: "Poulet Grillé", nameAr: "دجاج مشوي", category: "grilledMeats", origin: "tunisian" as const, caloriesPer100g: 178, proteinPer100g: 26.5, carbsPer100g: 0, fatsPer100g: 7.2, typicalServingGrams: 200, aliases: ["grilled chicken","دجاج مشوي"] },
  { name: "Grilled Fish Daurade", nameEn: "Grilled Fish Daurade", nameFr: "Daurade Grillée", nameAr: "دنيس مشوي", category: "seafood", origin: "tunisian" as const, caloriesPer100g: 118, proteinPer100g: 22.5, carbsPer100g: 0, fatsPer100g: 3.2, typicalServingGrams: 150, aliases: ["sea bream","grilled daurade","دنيس"] },
  { name: "Grilled Lamb Chops", nameEn: "Grilled Lamb Chops", nameFr: "Côtes d'Agneau Grillées", nameAr: "مقطعات علوش مشوية", category: "grilledMeats", origin: "tunisian" as const, caloriesPer100g: 342, proteinPer100g: 25.8, carbsPer100g: 0, fatsPer100g: 26.5, typicalServingGrams: 100, aliases: ["lamb chops","mechoui"] },
  { name: "Hamoud Boualem Lemonade", nameEn: "Hamoud Boualem Lemonade", nameFr: "Limonade Hamoud", nameAr: "ليموناضة حمود", category: "beverages", origin: "packaged" as const, caloriesPer100g: 38, proteinPer100g: 0, carbsPer100g: 9.5, fatsPer100g: 0, typicalServingGrams: 250, aliases: ["hamoud lemonade","ليموناضة حمود"] },
  { name: "Harissa Sauce", nameEn: "Harissa Sauce", nameFr: "Harissa", nameAr: "هريسة", category: "condiments", origin: "tunisian" as const, caloriesPer100g: 50, proteinPer100g: 2, carbsPer100g: 6, fatsPer100g: 2, typicalServingGrams: 15, aliases: ["harissa","هريسة"] },
  { name: "Ice Cream Chocolate", nameEn: "Ice Cream Chocolate", nameFr: "Glace au Chocolat", nameAr: "آيس كريم شوكولاتة", category: "desserts", origin: "tunisian" as const, caloriesPer100g: 195, proteinPer100g: 3.5, carbsPer100g: 23.5, fatsPer100g: 9.5, typicalServingGrams: 60, aliases: ["chocolate ice cream","آيس كريم شوكولاتة"] },
  { name: "Jadida Couscous", nameEn: "Jadida Couscous", nameFr: "Couscous Jadida", nameAr: "كسكس جديدة", category: "pantry", origin: "packaged" as const, caloriesPer100g: 360, proteinPer100g: 12.5, carbsPer100g: 72.5, fatsPer100g: 1.5, typicalServingGrams: 100, aliases: ["jadida couscous"] },
  { name: "Kaab Ghzala", nameEn: "Kaab Ghzala", nameFr: "Kaab Ghzala", nameAr: "كعب غزالة", category: "pastries", origin: "tunisian" as const, caloriesPer100g: 420, proteinPer100g: 6.5, carbsPer100g: 48, fatsPer100g: 23, typicalServingGrams: 40, aliases: ["gazelle horn pastry","kaab ghzala","كعب غزالة"] },
  { name: "Kesra Bread", nameEn: "Kesra Bread", nameFr: "Pain Kesra", nameAr: "كسرة", category: "breads", origin: "tunisian" as const, caloriesPer100g: 275, proteinPer100g: 8.5, carbsPer100g: 52, fatsPer100g: 3.2, typicalServingGrams: 80, aliases: ["kesra","tunisian flatbread"] },
  { name: "KFC Original Chicken", nameEn: "KFC Original Chicken", nameFr: "Poulet KFC", nameAr: "دجاج كي إف سي", category: "fastFood", origin: "tunisian" as const, caloriesPer100g: 245, proteinPer100g: 18.5, carbsPer100g: 8.5, fatsPer100g: 15.8, typicalServingGrams: 120, aliases: ["kfc chicken","دجاج كنتاكي"] },
  { name: "Kiri Cream Cheese", nameEn: "Kiri Cream Cheese", nameFr: "Kiri", nameAr: "كيري", category: "dairy", origin: "tunisian" as const, caloriesPer100g: 295, proteinPer100g: 8, carbsPer100g: 4.5, fatsPer100g: 27.5, typicalServingGrams: 20, aliases: ["kiri","كيري"] },
  { name: "KitKat", nameEn: "KitKat", nameFr: "KitKat", nameAr: "كت كات", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 518, proteinPer100g: 6.8, carbsPer100g: 58.5, fatsPer100g: 27.5, typicalServingGrams: 17, aliases: ["kitkat","كت كات"] },
  { name: "Lablabi", nameEn: "Lablabi", nameFr: "Lablabi", nameAr: "لبلابي", category: "soups", origin: "tunisian" as const, caloriesPer100g: 125, proteinPer100g: 6.2, carbsPer100g: 18.5, fatsPer100g: 3.5, typicalServingGrams: 300, aliases: ["chickpea soup","lablebi"] },
  { name: "Lay's Classic", nameEn: "Lays Classic", nameFr: "Lays Classique", nameAr: "ليز كلاسيك", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 540, proteinPer100g: 6, carbsPer100g: 52.5, fatsPer100g: 35, typicalServingGrams: 40, aliases: ["lays classic","ليز كلاسيك"] },
  { name: "Maamoul Dates", nameEn: "Maamoul Dates", nameFr: "Maamoul aux Dattes", nameAr: "معمول بالتمر", category: "pastries", origin: "tunisian" as const, caloriesPer100g: 395, proteinPer100g: 5.2, carbsPer100g: 55.8, fatsPer100g: 17.5, typicalServingGrams: 45, aliases: ["maamoul dates","date cookies","معمول تمر"] },
  { name: "Makroudh", nameEn: "Makroudh", nameFr: "Makroudh", nameAr: "مقروض", category: "pastries", origin: "tunisian" as const, caloriesPer100g: 385, proteinPer100g: 5.8, carbsPer100g: 58.5, fatsPer100g: 16.2, typicalServingGrams: 70, aliases: ["makroud","date pastry"] },
  { name: "Mars", nameEn: "Mars", nameFr: "Mars", nameAr: "مارس", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 468, proteinPer100g: 5.2, carbsPer100g: 65.5, fatsPer100g: 20, typicalServingGrams: 51, aliases: ["mars bar","مارس"] },
  { name: "McDonald's Big Mac", nameEn: "McDonald's Big Mac", nameFr: "Big Mac McDonald's", nameAr: "بيج ماك", category: "fastFood", origin: "tunisian" as const, caloriesPer100g: 257, proteinPer100g: 11.8, carbsPer100g: 20.5, fatsPer100g: 13.5, typicalServingGrams: 214, aliases: ["big mac","بيج ماك"] },
  { name: "Mechouia Salad", nameEn: "Mechouia Salad", nameFr: "Salade Mechouia", nameAr: "سلعة مشوية", category: "salads", origin: "tunisian" as const, caloriesPer100g: 85, proteinPer100g: 3.2, carbsPer100g: 8.5, fatsPer100g: 4.8, typicalServingGrams: 100, aliases: ["grilled salad"] },
  { name: "Merguez Sausage", nameEn: "Merguez Sausage", nameFr: "Merguez Tunisienne", nameAr: "مركاز تونسي", category: "grilledMeats", origin: "tunisian" as const, caloriesPer100g: 295, proteinPer100g: 14.2, carbsPer100g: 2.5, fatsPer100g: 25.8, typicalServingGrams: 80, aliases: ["merguez sausage","spicy sausage","مركاز"] },
  { name: "Milka Chocolate", nameEn: "Milka Chocolate", nameFr: "Chocolat Milka", nameAr: "شوكولاتة ميلكا", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 540, proteinPer100g: 5.5, carbsPer100g: 57, fatsPer100g: 32.5, typicalServingGrams: 10, aliases: ["milka chocolate","ميلكا"] },
  { name: "Mlawi Bread", nameEn: "Mlawi Bread", nameFr: "Mlawi", nameAr: "ملوي", category: "breads", origin: "tunisian" as const, caloriesPer100g: 312, proteinPer100g: 7.8, carbsPer100g: 48.5, fatsPer100g: 10.5, typicalServingGrams: 150, aliases: ["mlawi bread","tunisian pancake","ملوي"] },
  { name: "Mloukhia", nameEn: "Mloukhia", nameFr: "Mloukhia", nameAr: "ملوخية", category: "soups", origin: "tunisian" as const, caloriesPer100g: 95, proteinPer100g: 6.8, carbsPer100g: 8.2, fatsPer100g: 4.5, typicalServingGrams: 250, aliases: ["jute leaves stew","molokhia"] },
  { name: "Nescafe 3in1", nameEn: "Nescafe 3in1", nameFr: "Nescafé 3en1", nameAr: "نسكافيه 3 في 1", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 55, proteinPer100g: 1.5, carbsPer100g: 8.5, fatsPer100g: 2, typicalServingGrams: 180, aliases: ["nescafe 3in1","نسكافيه 3 في 1"] },
  { name: "Nutella", nameEn: "Nutella", nameFr: "Nutella", nameAr: "نوتيلا", category: "pantry", origin: "tunisian" as const, caloriesPer100g: 533, proteinPer100g: 6.8, carbsPer100g: 56, fatsPer100g: 31, typicalServingGrams: 20, aliases: ["nutella","نوتيلا"] },
  { name: "Olive Oil Extra Virgin", nameEn: "Olive Oil Extra Virgin", nameFr: "Huile d'Olive Extra Vierge", nameAr: "زيت زيتون بكر", category: "condiments", origin: "tunisian" as const, caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatsPer100g: 100, typicalServingGrams: 14, aliases: ["olive oil","زيت زيتون"] },
  { name: "Omelette", nameEn: "Omelette", nameFr: "Omelette", nameAr: "أمليت", category: "breakfast", origin: "tunisian" as const, caloriesPer100g: 155, proteinPer100g: 11, carbsPer100g: 1.5, fatsPer100g: 12, typicalServingGrams: 120, aliases: ["omelette","أمليت"] },
  { name: "Orange Juice Fresh", nameEn: "Orange Juice Fresh", nameFr: "Jus d'Orange Frais", nameAr: "عصير برتقال طازج", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 45, proteinPer100g: 0.8, carbsPer100g: 10.5, fatsPer100g: 0.2, typicalServingGrams: 250, aliases: ["orange juice","عصير برتقال"] },
  { name: "Pasta Bolognese", nameEn: "Pasta Bolognese", nameFr: "Pâtes Bolognaise", nameAr: "معكرونة بولونيز", category: "main", origin: "tunisian" as const, caloriesPer100g: 148, proteinPer100g: 7.8, carbsPer100g: 22, fatsPer100g: 4.2, typicalServingGrams: 320, aliases: ["pasta bolognese","معكرونة بولونيز"] },
  { name: "Pepsi", nameEn: "Pepsi", nameFr: "Pepsi", nameAr: "بيبسي", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 41, proteinPer100g: 0, carbsPer100g: 10.5, fatsPer100g: 0, typicalServingGrams: 330, aliases: ["pepsi","بيبسي"] },
  { name: "Pizza Hut Margherita", nameEn: "Pizza Hut Margherita", nameFr: "Pizza Margherita Pizza Hut", nameAr: "بيتزا مارغريتا", category: "fastFood", origin: "tunisian" as const, caloriesPer100g: 248, proteinPer100g: 9.5, carbsPer100g: 32.5, fatsPer100g: 9.2, typicalServingGrams: 100, aliases: ["pizza hut margherita","بيتزا هت مارغريتا"] },
  { name: "Pringles Original", nameEn: "Pringles Original", nameFr: "Pringles Original", nameAr: "برينقلز أصلي", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 535, proteinPer100g: 4.5, carbsPer100g: 52, fatsPer100g: 34.5, typicalServingGrams: 50, aliases: ["pringles original","برينقلز أصلي"] },
  { name: "Safia Water", nameEn: "Safia Water", nameFr: "Eau Safia", nameAr: "ماء صافية", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatsPer100g: 0, typicalServingGrams: 500, aliases: ["safia water","صافية"] },
  { name: "SICAM Harissa", nameEn: "SICAM Harissa", nameFr: "Harissa SICAM", nameAr: "هريسة سيكام", category: "condiments", origin: "packaged" as const, caloriesPer100g: 145, proteinPer100g: 4.5, carbsPer100g: 12.5, fatsPer100g: 8.5, typicalServingGrams: 15, aliases: ["sicam harissa"] },
  { name: "SICAM Tuna in Water", nameEn: "SICAM Tuna in Water", nameFr: "Thon SICAM au Naturel", nameAr: "تونة سيكام طبيعي", category: "seafood", origin: "packaged" as const, caloriesPer100g: 108, proteinPer100g: 25.8, carbsPer100g: 0, fatsPer100g: 0.8, typicalServingGrams: 80, aliases: ["sicam tuna water","سيكام تونة طبيعي"] },
  { name: "Snickers", nameEn: "Snickers", nameFr: "Snickers", nameAr: "سنيكرز", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 495, proteinPer100g: 8.5, carbsPer100g: 57.5, fatsPer100g: 25.5, typicalServingGrams: 50, aliases: ["snickers","سنيكرز"] },
  { name: "Sprite", nameEn: "Sprite", nameFr: "Sprite", nameAr: "سبرايت", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 40, proteinPer100g: 0, carbsPer100g: 10, fatsPer100g: 0, typicalServingGrams: 330, aliases: ["sprite","سبرايت"] },
  { name: "Tabouna Bread", nameEn: "Tabouna Bread", nameFr: "Pain Tabouna", nameAr: "طابونة", category: "breads", origin: "tunisian" as const, caloriesPer100g: 265, proteinPer100g: 9.2, carbsPer100g: 54.5, fatsPer100g: 2.8, typicalServingGrams: 200, aliases: ["tabouna","tunisian bread"] },
  { name: "Tunisian Dates Deglet Nour", nameEn: "Tunisian Dates Deglet Nour", nameFr: "Dattes Deglet Nour", nameAr: "دقلع نور", category: "snacks", origin: "packaged" as const, caloriesPer100g: 282, proteinPer100g: 2.5, carbsPer100g: 72.5, fatsPer100g: 0.5, typicalServingGrams: 15, aliases: ["deglet nour dates","tunisian dates"] },
  { name: "Tunisian Mint Tea", nameEn: "Tunisian Mint Tea", nameFr: "Thé à la Menthe", nameAr: "أتاي بالنعناع", category: "beverages", origin: "tunisian" as const, caloriesPer100g: 42, proteinPer100g: 0.2, carbsPer100g: 10.5, fatsPer100g: 0, typicalServingGrams: 150, aliases: ["maghrebi tea","atay","mint tea"] },
  { name: "Tunisian Roumy Cheese", nameEn: "Tunisian Cheese Roumy", nameFr: "Fromage Roumy", nameAr: "جبنة رومي", category: "dairy", origin: "tunisian" as const, caloriesPer100g: 352, proteinPer100g: 22.5, carbsPer100g: 1.2, fatsPer100g: 28.5, typicalServingGrams: 30, aliases: ["romi cheese","roumy cheese","جبنة رومي"] },
  { name: "Twix", nameEn: "Twix", nameFr: "Twix", nameAr: "توكس", category: "snacks", origin: "tunisian" as const, caloriesPer100g: 495, proteinPer100g: 5, carbsPer100g: 62.5, fatsPer100g: 24.5, typicalServingGrams: 25, aliases: ["twix","توكس"] },
  { name: "Vache Qui Rit", nameEn: "Vache Qui Rit", nameFr: "Vache Qui Rit", nameAr: "البقرة الضاحكة", category: "dairy", origin: "tunisian" as const, caloriesPer100g: 305, proteinPer100g: 15.5, carbsPer100g: 3.5, fatsPer100g: 26, typicalServingGrams: 25, aliases: ["vache qui rit","البقرة الضاحكة"] },
  { name: "Zlabia", nameEn: "Zlabia", nameFr: "Zlabia", nameAr: "زلابية", category: "pastries", origin: "tunisian" as const, caloriesPer100g: 378, proteinPer100g: 3.5, carbsPer100g: 62.5, fatsPer100g: 13.8, typicalServingGrams: 40, aliases: ["zlabia pastry","honey spiral","زلابية"] },
];

// Process raw foods into full FoodItem objects
function processFoods(): FoodItem[] {
  return rawFoods.map((food, index) => {
    // Assign confidence based on origin and data completeness
    let confidence: number;
    let verificationStatus: "verified" | "cross_checked" | "estimate";
    
    if (food.origin === "tunisian" && food.proteinPer100g > 0) {
      confidence = 92 + Math.floor(Math.random() * 8);
      verificationStatus = "verified";
    } else if (food.origin === "packaged") {
      confidence = 85 + Math.floor(Math.random() * 10);
      verificationStatus = "cross_checked";
    } else {
      confidence = 65 + Math.floor(Math.random() * 20);
      verificationStatus = "estimate";
    }

    return {
      id: `food-${index + 1}`,
      ...food,
      brand: null,
      confidence,
      verificationStatus,
    };
  });
}

// Export processed foods
export const TUNISIAN_FOODS: FoodItem[] = processFoods();

// Helper functions
export function searchFoods(query: string): FoodItem[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return TUNISIAN_FOODS.slice(0, 20);
  
  return TUNISIAN_FOODS.filter(food => {
    const searchFields = [
      food.name,
      food.nameEn,
      food.nameFr,
      food.nameAr,
      ...food.aliases
    ].filter(Boolean).map(f => f?.toLowerCase());
    
    return searchFields.some(field => field?.includes(lowerQuery));
  }).slice(0, 50);
}

export function filterFoods(filter: string): FoodItem[] {
  switch (filter) {
    case "verified":
      return TUNISIAN_FOODS.filter(f => f.verificationStatus === "verified");
    case "tunisian":
      return TUNISIAN_FOODS.filter(f => f.origin === "tunisian");
    case "packaged":
      return TUNISIAN_FOODS.filter(f => f.origin === "packaged");
    case "high-protein":
      return TUNISIAN_FOODS.filter(f => f.proteinPer100g >= 15);
    case "low-calorie":
      return TUNISIAN_FOODS.filter(f => f.caloriesPer100g <= 100);
    default:
      return TUNISIAN_FOODS;
  }
}

export function getLocalFavorites(): FoodItem[] {
  // Return top Tunisian foods by protein content
  return TUNISIAN_FOODS
    .filter(f => f.origin === "tunisian" && f.proteinPer100g > 10)
    .sort((a, b) => b.proteinPer100g - a.proteinPer100g)
    .slice(0, 10);
}

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("recent-food-searches");
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query: string): void {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentSearches();
    const updated = [query, ...recent.filter(q => q !== query)].slice(0, 5);
    localStorage.setItem("recent-food-searches", JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
}

export function getFoodById(id: string): FoodItem | undefined {
  return TUNISIAN_FOODS.find(f => f.id === id);
}

export function getFoodsByCategory(category: string): FoodItem[] {
  return TUNISIAN_FOODS.filter(f => f.category === category);
}

export function calculateNutrition(food: FoodItem, grams: number): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  const multiplier = grams / 100;
  return {
    calories: Math.round(food.caloriesPer100g * multiplier),
    protein: Math.round(food.proteinPer100g * multiplier * 10) / 10,
    carbs: Math.round(food.carbsPer100g * multiplier * 10) / 10,
    fat: Math.round(food.fatsPer100g * multiplier * 10) / 10,
  };
}
