const express = require("express");
const router = express.Router();
const { poolPromise } = require("../config/db");

/* ================= KITCHENS / CATEGORIES ================= */
router.get("/kitchens", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT cm.CategoryId, cm.CategoryName AS KitchenTypeName, ckt.KitchenTypeCode
      FROM CategoryMaster cm
      LEFT JOIN CategoryKitchenType ckt ON cm.CategoryId = ckt.CategoryId
      WHERE cm.IsActive = 1 ORDER BY cm.SortCode ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("KITCHEN ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/dishgroups/:CategoryId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("CategoryId", req.params.CategoryId).query(`
        SELECT a.DishGroupId, a.DishGroupName
        FROM DishGroupMaster a
        JOIN CategoryMaster b ON a.CategoryId = b.CategoryId
        WHERE a.CategoryId = @CategoryId AND a.IsActive = 1 ORDER BY a.SortCode ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* ================= DISHES ================= */
router.get("/dishes/all", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        d.DishId, d.Name, d.DishGroupId, d.currentcost AS Price,
        d.DishCode, d.Description,d.IsServiceCharge, ISNULL(d.IsCombo, 0) AS IsCombo,
        d.Imageid AS Image, CASE WHEN d.Imageid IS NOT NULL THEN 1 ELSE 0 END AS HasImage,
        ckt.KitchenTypeCode, ckt.KitchenTypeName, pm.PrinterPath AS PrinterIP, pm.PrinterName
      FROM DishMaster d
      LEFT JOIN DishGroupMaster dgm ON d.DishGroupId = dgm.DishGroupId
      LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
      LEFT JOIN PrintMaster pm ON CAST(ckt.KitchenTypeCode AS INT) = pm.KitchenTypeValue
      WHERE d.IsActive = 1 ORDER BY d.SordCode ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.get("/dishes/group/:DishGroupId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("DishGroupId", req.params.DishGroupId).query(`
        SELECT 
            d.DishId, 
            d.Name,  
            d.DishGroupId, 
            currentcost AS Price,
            d.Imageid AS Image,d.IsServiceCharge, ISNULL(d.IsCombo, 0) AS IsCombo,
            CASE WHEN d.Imageid IS NOT NULL THEN 1 ELSE 0 END AS HasImage,
            CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM DishModifier dm
                        WHERE dm.DishId = d.DishId
                    )
                    THEN 1
                    ELSE 0
                    END AS HasModifier,
            ckt.KitchenTypeCode, ckt.KitchenTypeName, pm.PrinterPath AS PrinterIP, pm.PrinterName
        FROM DishMaster d
        LEFT JOIN DishGroupMaster dgm ON d.DishGroupId = dgm.DishGroupId
        LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
        LEFT JOIN PrintMaster pm ON CAST(ckt.KitchenTypeCode AS INT) = pm.KitchenTypeValue
        WHERE d.IsActive = 1 
        AND d.DishGroupId = @DishGroupId ORDER BY d.SordCode ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

/* ================= IMAGES ================= */
router.get("/image/:imageId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Imageid", req.params.imageId)
      .query(`SELECT ImageData FROM ImageList WHERE Imageid = @Imageid`);

    if (result.recordset.length > 0 && result.recordset[0].ImageData) {
      res.set("Cache-Control", "public, max-age=86400"); // Cache for 1 day
      res.type("image/jpeg").send(result.recordset[0].ImageData);
    } else {
      res.status(404).send("Image not found");
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= MODIFIERS ================= */
router.get("/modifiers/:dishId", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input("dishId", req.params.dishId)
      .query(`
       SELECT
          dm.DishId,
          dm.ModifierId AS ModifierID,
          m.ModifierCode,
          m.ModifierName,
          ISNULL(m.DishCost, 0) AS Price,
          ISNULL(m.DishCost, 0) AS DishCost,
          ISNULL(m.isPriceAffect, 0) AS isPriceAffect,
          ISNULL(m.isDishPrice, 0) AS isDishPrice
          FROM DishModifier dm
          INNER JOIN ModifierMaster m
              ON dm.ModifierId = m.ModifierId
          WHERE dm.DishId = @dishId
          ORDER BY m.ModifierName ASC;
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/modifiers/validate", async (req, res) => {
  try {
    const { dishId } = req.body;
    if (!dishId)
      return res
        .status(400)
        .json({ valid: false, message: "Dish ID is required" });
    res.json({ valid: true, message: "Modifier selection is valid" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 🔥 ADD THIS BELOW 👇 */
router.post("/order/add", async (req, res) => {
  try {
    const pool = await poolPromise;

    const { dishId, name, price, qty } = req.body;

    const orderDetailId = require("crypto").randomUUID();
    const orderId = require("crypto").randomUUID();

    await pool
      .request()
      .input("OrderDetailId", orderDetailId)
      .input("OrderId", orderId)
      .input("DishId", dishId)
      .input("DishName", name)
      .input("Quantity", qty)
      .input("PricePerUnit", price)
      .input("BaseAmount", price * qty)
      .input("TotalDetailLineAmount", price * qty)
      .input("CreatedOn", new Date()).query(`
        INSERT INTO RestaurantOrderDetailCur (
          OrderDetailId,
          OrderId,
          DishId,
          DishName,
          Quantity,
          PricePerUnit,
          BaseAmount,
          TotalDetailLineAmount,
          CreatedOn,
          Description,
          StatusCode
        )
        VALUES (
          @OrderDetailId,
          @OrderId,
          @DishId,
          @DishName,
          @Quantity,
          @PricePerUnit,
          @BaseAmount,
          @TotalDetailLineAmount,
          @CreatedOn,
          '',
          'SENT'
        )
      `);

    res.json({ success: true });
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= COMPANY SETTINGS ================= */

router.get("/company/settings", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TOP 1 ServiceChargePercentage,GSTPercentage
      FROM CompanySettings
    `);

    // Safely fetch Enablekotqr and EnableCombo — only if they exist in AppSettings
    let enableKotQr = 0;
    let enableCombo = 0;
    try {
      const colCheck = await pool.request().query(`
        SELECT 
          (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AppSettings' AND COLUMN_NAME = 'Enablekotqr') AS cntKot,
          (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'AppSettings' AND COLUMN_NAME = 'EnableCombo') AS cntCombo
      `);
      let queryCols = [];
      if (colCheck.recordset[0]?.cntKot > 0) queryCols.push("Enablekotqr");
      if (colCheck.recordset[0]?.cntCombo > 0) queryCols.push("EnableCombo");
      
      if (queryCols.length > 0) {
        const appSettings = await pool.request().query(`
          SELECT TOP 1 ${queryCols.join(", ")} FROM AppSettings
        `);
        if (queryCols.includes("Enablekotqr")) {
          enableKotQr = Number(appSettings.recordset[0]?.Enablekotqr || 0);
        }
        if (queryCols.includes("EnableCombo")) {
          enableCombo = Number(appSettings.recordset[0]?.EnableCombo || 0);
        }
      }
    } catch (e) {
      console.warn("[company/settings] AppSettings check failed:", e.message);
    }

    const data = result.recordset[0] || {
      ServiceChargePercentage: 0,
      GSTPercentage: 0
    };

    data.Enablekotqr = enableKotQr;
    data.EnableCombo = enableCombo;

    res.json(data);

  } catch (err) {
    console.error("COMPANY SETTINGS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= PAYMODES ================= */
router.get("/paymodes/qrs", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT PayMode, PaymodeImage FROM PAYMODE 
      WHERE PayMode IN ('PAYNOW    ', 'UPI       ')
    `);

    const qrs = {};

    result.recordset.forEach(row => {

      if (row.PayMode.trim() === 'PAYNOW') {
        qrs.paynow = row.PaymodeImage
          ? row.PaymodeImage.toString("base64")
          : "";
      }

      if (row.PayMode.trim() === 'UPI') {
        qrs.upi = row.PaymodeImage
          ? row.PaymodeImage.toString("base64")
          : "";
      }

    });

    res.json(qrs);
  } catch (err) {
    console.error("GET QRS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/paymodes/update-qr", async (req, res) => {
  try {

    const pool = await poolPromise;

    const { payMode, upiId } = req.body;

    let dbPayMode = '';

    if (payMode === 'paynow')
      dbPayMode = 'PAYNOW    ';
    else if (payMode === 'upi')
      dbPayMode = 'UPI       ';
    else
      return res.status(400).json({ error: "Invalid payMode" });

    await pool.request()
      .input("PayMode", dbPayMode)
      .input("Image", Buffer.from(upiId, "base64"))
      .query(`
        UPDATE PAYMODE
        SET PaymodeImage = @Image
        WHERE PayMode = @PayMode
      `);

    res.json({ success: true });

  } catch (err) {

    console.error("UPDATE QR ERROR:", err);

    res.status(500).json({ error: err.message });
  }
});

router.get("/app-settings", async (req, res) => {
  try {
    const pool = await poolPromise;

    const result = await pool.request().query(`
      SELECT TOP 1 enablelogin AS EnableLogin
      FROM AppSettings
    `);

    res.json({
      success: true,
      enableLogin: Number(result.recordset[0]?.EnableLogin || 0)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

/* LAST LINE */
module.exports = router;
