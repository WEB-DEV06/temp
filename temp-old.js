const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');

// GET dashboard summary
router.get('/summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const totalStudents = await Student.countDocuments({ isActive: true });
    const presentToday = await Attendance.countDocuments({ date: today });
    const absentToday = totalStudents - presentToday;
    const rate = totalStudents > 0 ? ((presentToday / totalStudents) * 100).toFixed(1) : 0;

    // Weekly data (last 7 days)
    const weekly = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = await Attendance.countDocuments({ date: dateStr });
      weekly.push({
        date: dateStr,
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count
      });
    }

    // Department breakdown for today
    const deptBreakdown = await Attendance.aggregate([
      { $match: { date: today } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      totalStudents,
      presentToday,
      absentToday,
      attendanceRate: parseFloat(rate),
      weekly,
      deptBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET attendance records with filters
router.get('/', async (req, res) => {
  try {
    const { date, department, search, limit = 100 } = req.query;
    let query = {};
    if (date) query.date = date;
    if (department) query.department = new RegExp(department, 'i');
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { rollNumber: new RegExp(search, 'i') }
      ];
    }

    const records = await Attendance.find(query)
      .sort({ markedAt: -1 })
      .limit(parseInt(limit));

    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST mark attendance
router.post('/', async (req, res) => {
  try {
    const { studentId, confidence } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!student.isActive) return res.status(400).json({ error: 'Student is not active' });

    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true
    });

    const existing = await Attendance.findOne({ studentId, date: today });
    if (existing) {
      return res.status(409).json({
        error: 'Attendance already marked for today',
        alreadyMarked: true,
        student: {
          name: student.name,
          rollNumber: student.rollNumber,
          department: student.department
        },
        markedAt: existing.markedAt
      });
    }

    const record = new Attendance({
      studentId,
      date: today,
      time,
      confidence: confidence || 0,
      name: student.name,
      rollNumber: student.rollNumber,
      department: student.department
    });

    await record.save();
    res.status(201).json({
      message: `Attendance marked for ${student.name}`,
      record,
      student: {
        name: student.name,
        rollNumber: student.rollNumber,
        department: student.department,
        photo: student.photo
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Attendance already marked for today', alreadyMarked: true });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE attendance record
router.delete('/:id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
