import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getGoalMovements = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { goalId } = req.params;

    const result = await query(
      `SELECT id, goal_id, amount, note, created_at, updated_at
       FROM financial_goal_movements
       WHERE user_id = $1 AND goal_id = $2
       ORDER BY created_at DESC`,
      [userId, goalId]
    );

    res.json({
      success: true,
      movements: result.rows.map((row) => ({
        id: row.id,
        goalId: row.goal_id,
        amount: parseFloat(row.amount),
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Get financial goal movements error:', error);
    res.status(500).json({ message: 'Error fetching financial goal movements', error: error.message });
  }
};

export const addGoalMovement = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { goalId } = req.params;
    const { amount, note } = req.body;

    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return res.status(400).json({ message: 'Amount is required and must be a number' });
    }

    const numericAmount = parseFloat(amount);

    const movementResult = await query(
      `INSERT INTO financial_goal_movements (user_id, goal_id, amount, note)
       VALUES ($1, $2, $3, $4)
       RETURNING id, goal_id, amount, note, created_at, updated_at`,
      [userId, goalId, numericAmount, note || null]
    );

    // Update current_amount on the goal
    await query(
      `UPDATE financial_goals
       SET current_amount = COALESCE(current_amount, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [numericAmount, goalId, userId]
    );

    const row = movementResult.rows[0];

    res.status(201).json({
      success: true,
      movement: {
        id: row.id,
        goalId: row.goal_id,
        amount: parseFloat(row.amount),
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Add financial goal movement error:', error);
    res.status(500).json({ message: 'Error adding financial goal movement', error: error.message });
  }
};

export const updateGoalMovement = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { goalId, movementId } = req.params;
    const { amount, note } = req.body;

    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return res.status(400).json({ message: 'Amount is required and must be a number' });
    }

    const numericAmount = parseFloat(amount);

    // Get existing movement
    const existingResult = await query(
      `SELECT amount
       FROM financial_goal_movements
       WHERE id = $1 AND goal_id = $2 AND user_id = $3`,
      [movementId, goalId, userId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Movement not found' });
    }

    const existingAmount = parseFloat(existingResult.rows[0].amount);
    const delta = numericAmount - existingAmount;

    const updateResult = await query(
      `UPDATE financial_goal_movements
       SET amount = $1,
           note = COALESCE($2, note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND goal_id = $4 AND user_id = $5
       RETURNING id, goal_id, amount, note, created_at, updated_at`,
      [numericAmount, note || null, movementId, goalId, userId]
    );

    // Adjust current_amount on the goal
    await query(
      `UPDATE financial_goals
       SET current_amount = COALESCE(current_amount, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [delta, goalId, userId]
    );

    const row = updateResult.rows[0];

    res.json({
      success: true,
      movement: {
        id: row.id,
        goalId: row.goal_id,
        amount: parseFloat(row.amount),
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Update financial goal movement error:', error);
    res.status(500).json({ message: 'Error updating financial goal movement', error: error.message });
  }
};

export const deleteGoalMovement = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { goalId, movementId } = req.params;

    // Get existing movement
    const existingResult = await query(
      `SELECT amount
       FROM financial_goal_movements
       WHERE id = $1 AND goal_id = $2 AND user_id = $3`,
      [movementId, goalId, userId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ message: 'Movement not found' });
    }

    const existingAmount = parseFloat(existingResult.rows[0].amount);

    // Delete movement
    await query(
      `DELETE FROM financial_goal_movements
       WHERE id = $1 AND goal_id = $2 AND user_id = $3`,
      [movementId, goalId, userId]
    );

    // Adjust current_amount on the goal
    await query(
      `UPDATE financial_goals
       SET current_amount = COALESCE(current_amount, 0) - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [existingAmount, goalId, userId]
    );

    res.json({
      success: true,
      message: 'Movement deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete financial goal movement error:', error);
    res.status(500).json({ message: 'Error deleting financial goal movement', error: error.message });
  }
};

